/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExperimentRunner, sampleParticipants, invokeLLM, uniform, getParam, sample, selectPrevTrialData, mean, sum, prepareTimeline } from '@adriansteffan/reactive';
import SamplingParadigm from './SamplingParadigm';
import Papa from 'papaparse';
import problemsCsv from './problems.csv?raw';


interface Problem {
  problem: string;
  risky_high: number; risky_high_p: number;
  risky_low: number; risky_low_p: number;
  safe: number; ev_risky: number;
  rrate_desc: number; rrate_samp: number;
  desc_prefers: string; samp_prefers: string;
  ev_max: string; rrate_diff: number;
  domain: string; treasure_disaster: string;
  category: string; ev_max_condition: string;
}

const problems = Papa.parse<Problem>(problemsCsv, { header: true, dynamicTyping: true, skipEmptyLines: true }).data;

const VOICE_RECORDING_PROMPT = 'Please describe the decision you just made to a participant in an upcoming study. They will have to make the same decision as you, but your description will be their main source of information. (So unlike you, they will not be able to search for information themselves but will go straight to the decision screen after reading your description.) So please include all the information you think is valuable to make an informed decision (their bonus payment will also depend on their decision and therefore on the quality of the description you provide).';


const simulationConfig = {
  seed: 42,
  participants: () => sampleParticipants('sobol', 50, {
    sampleCount: { distribution: 'discrete', outcomes: [{ value: 5, weight: 1 }, { value: 20, weight: 1 }, { value: 60, weight: 1 }] },
  }),
};

const samplingSimulators = {
  sampleSingle: (tp: any, p: any) => {
    if ((tp.samplesSoFar?.length ?? 0) >= (p.sampleCount ?? 20))
      return { value: { deck: -1, rt: 0 }, participantState: p };
    return { value: { deck: uniform(0, 1) > 0.5 ? 0 : 1, rt: uniform(300, 1500) }, participantState: p };
  },
  decide: (tp: any, p: any) => {
    const samples: any[] = tp.samples || [];
    const means = [0, 1].map((d: number) =>
      mean(samples.filter((s: any) => s.deck === d).map((s: any) => s.value))
    );
    const choice = means[0] > means[1] ? 0 : means[1] > means[0] ? 1 : (uniform(0, 1) > 0.5 ? 0 : 1);
    return { value: choice, participantState: p };
  },
};

const voiceRecordingSimulators = {
  respondTTS: async (_input: any, participant: any) => {
    const s = participant.lastSampling;
    const samplingLog = s
      ? s.samples.map((d: any) => `Drew ${d.value} from Lottery ${d.deck === 0 ? 'A' : 'B'}`).join('; ')
      : 'no samples available';
    const choice = s ? `You chose Lottery ${s.finalChoice}${s.finalValue != null ? ` and received ${s.finalValue.toFixed(1)}` : ' (you were not shown the result)'}.` : '';
    return {
      // @ts-ignore - process.env is available in simulation (Node) context
      value: await invokeLLM(
        // @ts-ignore
        { provider: 'openai', model: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY },
        `You are a participant in a study. You just completed a task where you could freely draw from two lotteries to learn about their payoff distributions, then chose one lottery for your final reward.\n\nHere is what you saw during sampling: ${samplingLog}\n\n${choice}\n\nNow the experimenters ask you:\n"${VOICE_RECORDING_PROMPT}"\n\nRespond naturally as if speaking aloud (this will be a voice recording). Keep in mind to act the role of a participant, not a helpful ai agent. You want to target a recording of 20-30 seconds and keep it brief, and your memory is also imperfect`,
      ),
      participantState: participant,
    };
  },
};

const keyLeft = getParam('keyLeft', '', 'string', 'Key for left lottery (empty = disabled)');
const keyRight = getParam('keyRight', '', 'string', 'Key for right lottery (empty = disabled)');
const samplingKeys = keyLeft && keyRight ? [keyLeft, keyRight] as [string, string] : undefined;
const minRecordingDuration = getParam('minRecordingDuration', 13000, 'number', 'Minimum voice recording duration (ms)');

interface TrialConfig {
  problem: string;
  distributions: [any, any];
  riskyDeckIndex: number;
  rareOutcomeValue: number;
  domain: string;
  treasureDisaster: string;
}

const trialConfigs: TrialConfig[] = (() => {
  const domains = sample(['Gain', 'Loss', 'Mixed'], 5, { replace: false });
  const [a, b] = uniform(0, 1) > 0.5 ? ['Disaster', 'Treasure'] : ['Treasure', 'Disaster'];
  const types = [a, b, b, ...sample(['Disaster', 'Treasure'], 2, { replace: false })];

  const usedProblems = new Set<string>();
  return domains.map((domain, i) => {
    const type = types[i];
    const pick = sample(problems.filter(p =>
      p.domain === domain && p.treasure_disaster === type && !usedProblems.has(p.problem)
    ), 1)[0];
    usedProblems.add(pick.problem);

    const riskyDist = {
      type: 'discrete' as const,
      outcomes: [
        { value: pick.risky_high, weight: pick.risky_high_p },
        { value: pick.risky_low, weight: pick.risky_low_p },
      ],
    };
    const safeDist = {
      type: 'discrete' as const,
      outcomes: [{ value: pick.safe, weight: 1 }],
    };

    const riskyDeckIndex = uniform(0, 1) > 0.5 ? 1 : 0;
    const distributions: [any, any] = riskyDeckIndex === 1 ? [safeDist, riskyDist] : [riskyDist, safeDist];
    const rareOutcomeValue = pick.risky_low_p < pick.risky_high_p ? pick.risky_low : pick.risky_high;

    return { problem: pick.problem, distributions, riskyDeckIndex, rareOutcomeValue, domain, treasureDisaster: type };
  });
})();

function makeSamplingTrial(tc: TrialConfig, name: string) {
  const { distributions, ...metadata } = tc;
  return {
    name,
    type: 'SamplingParadigm',
    simulate: true,
    metadata,
    props: {
      distributions: tc.distributions,
      labels: ['A', 'B'] as [string, string],
      keys: samplingKeys,
      hideResult: true,
      headings: { saved: 'Your choice has been saved, you will see the outcome at the end of the experiment!' },
    },
    simulators: samplingSimulators,
  };
}

function makeSamplingInstruction(name: string, ordinal = 'next') {
  return {
    name,
    type: 'Text',
    props: {
      buttonText: 'Start Trial',
      animate: true,
      centered: true,
      content: (
        <p>
          The {ordinal} trial is about to start. Please collect information about the two lotteries you can choose between by clicking the buttons on screen. Once you are ready to make a decision, click "Proceed to decision" to indicate which lottery you choose to determine part of your bonus payment.
        </p>
      ),
    },
  };
}

function makeVoiceRecording(name: string) {
  return {
    name,
    type: 'VoiceRecording',
    props: {
      content: <p>{VOICE_RECORDING_PROMPT}</p>,
      minDuration: minRecordingDuration,
      shortRecordingWarning: 'Your recording seems quite short. Please consider adding more detail to your description so the next participant can make an informed decision and you get the full reward for the study. You can press the recording button again to add more or use the trash button to start over.',
      animate: true,
    },
    simulators: voiceRecordingSimulators,
  };
}


const experiment = prepareTimeline([
  {
    name: 'device_check',
    type: 'CheckDevice',
    props: {
      check: (deviceInfo: any) => !deviceInfo.isMobile,
      content: (
        <div>
          <h1><strong>Incompatible Device</strong></h1>
          <p>This experiment requires a desktop or laptop computer. Please reopen this link on a non-mobile device.</p>
        </div>
      ),
    },
  },
  {
    name: 'welcome',
    type: 'Text',
    props: {
      buttonText: 'I Agree',
      animate: true,
      content: (
        <>
          <h1><strong>Welcome!</strong></h1>
          <p>
            Thank you for your interest in this study. This experiment will take approximately <strong>10 minutes</strong> to complete.
          </p>
          <p>
            You will be presented with a decision-making task involving lotteries. At the end, we will ask you about your experience - you don't have to type anything, we will <strong>record your voice</strong>.
          </p>
          <p>
            The recording itself will <strong>not</strong> be used for anything other than transcribing (ensuring that it is anonymous). The transcribed text will be processed further for research purposes.
          </p>
          <p>
            By clicking "I Agree" below, you confirm that you consent to having your voice recorded and transcribed as described above.
          </p>
        </>
      ),
    },
  },
  {
    name: 'mic_check',
    type: 'MicrophoneCheck',
    props: {
      animate: true,
    },
  },
  {
    name: 'consent',
    type: 'Text',
    props: {
      buttonText: 'I Agree',
      animate: true,
      content: (
        <>
          <h1><strong>Informed Consent</strong></h1>
          <p>[Some legal consent talk here]</p>
          <p>
            If you agree, please click the button below. Otherwise, please go back to Prolific and return the study so another participant can partake.
          </p>
        </>
      ),
    },
  },
  {
    name: 'enter_fullscreen',
    type: 'EnterFullscreen',
    props: {
      animate: true,
      buttonText: 'Enter Fullscreen Mode',
      content: (
        <p>
          This experiment works best in fullscreen mode. <br />
          Please click the button below to continue.
        </p>
      ),
    },
  },
  {
    name: 'instructions',
    type: 'Text',
    props: {
      buttonText: 'Continue',
      animate: true,
      content: (
        <>
          <h1><strong>Task Instructions</strong></h1>
          <p>
            You will be making a few decisions between two lotteries, represented by two buttons on the screen.
          </p>
          <p>
            In the <strong>search phase</strong>, you can collect information about the current two lotteries by clicking them and seeing a randomly drawn outcome. Once you feel you know enough to make a decision, you can proceed to the next phase.
          </p>
          <p>
            In the <strong>decision phase</strong>, you will click one of the two lotteries and receive a randomly drawn outcome that will count towards your total balance. You will not see what the consequential outcomes are until the end of the experiment.
          </p>
          <p>
            How well you perform will determine your bonus payment, which can range from <strong>£0 to £1</strong>.
          </p>
        </>
      ),
    },
  },
  makeSamplingInstruction('instruction_practice_1', 'first'),
  makeSamplingTrial(trialConfigs[0], 'practice_1'),
  makeSamplingInstruction('instruction_practice_2'),
  makeSamplingTrial(trialConfigs[1], 'practice_2'),
  makeSamplingInstruction('instruction_trial_3'),
  makeSamplingTrial(trialConfigs[2], 'trial_3'),
  { type: 'UPDATE_STORE', fun: (data: any) => {
    const samples: any[] = selectPrevTrialData(data, 'SamplingParadigm')?.responseData ?? [];
    const sawRare = samples.some((s: any) =>
      s.deck === trialConfigs[2].riskyDeckIndex &&
      Math.abs(s.value - trialConfigs[2].rareOutcomeValue) < 0.01
    );
    return { rareEventSeen: sawRare };
  }},
  { type: 'IF_BLOCK', cond: (_d: any, store: any) => store.rareEventSeen, timeline: [
    makeVoiceRecording('voicerecording_1'),
    makeSamplingInstruction('instruction_test_2'),
    makeSamplingTrial(trialConfigs[3], 'test_2'),
    makeVoiceRecording('voicerecording_2'),
  ]},
  { type: 'IF_BLOCK', cond: (_d: any, store: any) => !store.rareEventSeen, timeline: [
    makeSamplingInstruction('instruction_test_1'),
    makeSamplingTrial(trialConfigs[3], 'test_1'),
    makeVoiceRecording('voicerecording_1'),
    makeSamplingInstruction('instruction_test_2'),
    makeSamplingTrial(trialConfigs[4], 'test_2'),
    makeVoiceRecording('voicerecording_2'),
  ]},
  {
    name: 'upload',
    type: 'Upload',
    props: {
      autoUpload: false,
    },
  },
  {
    name: 'exit_fullscreen',
    type: 'ExitFullscreen',
    props: {},
  },
  {
    name: 'finaltext',
    type: 'Text',
    props: (data: any) => {
      const prolificCode = import.meta.env?.VITE_PROLIFIC_CODE || 'PROLIFIC_CODE_HERE';

      const trials = data.filter((d: any) => d.type === 'SamplingParadigm');
      const outcomes = trials.map((d: any, i: number) => {
        const row = Array.isArray(d.responseData) ? d.responseData[0] : d.responseData;
        return { trial: i + 1, name: d.name, choice: row?.finalChoice ?? '?', value: row?.finalValue ?? 0 };
      });

      const hasShortRecording = data.filter((d: any) => d.type === 'VoiceRecording')
        .some((r: any) => (r.responseData?.recordingDuration ?? 0) < minRecordingDuration);
      const totalPoints = sum(outcomes.map((o: any) => o.value));
      // TODO: use actual transformation formula
      const bonus = hasShortRecording ? 0 : totalPoints;
      const cell = { border: '1px solid #ccc', padding: '8px' };

      return {
        buttonText: '',
        content: (
          <>
            <h1><strong>Experiment Complete</strong></h1>
            <p>Thank you for participating! Here are the outcomes from your chosen lotteries:</p>
            <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1rem', marginBottom: '1rem' }}>
              <thead>
                <tr>
                  <th style={{ ...cell, textAlign: 'left' }}>Trial</th>
                  <th style={{ ...cell, textAlign: 'left' }}>Chosen Lottery</th>
                  <th style={{ ...cell, textAlign: 'right' }}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.map((o: any) => (
                  <tr key={o.trial}>
                    <td style={cell}>{o.trial}</td>
                    <td style={cell}>{o.choice}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{o.value.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasShortRecording ? (
              <p>
                <strong>Note:</strong> One or more of your voice recordings was too short. As stated in the instructions your bonus payment has thus been set to <strong>£0.00</strong>.
              </p>
            ) : (
              <p>
                Your bonus payment is: <strong>£{bonus.toFixed(2)}</strong>
              </p>
            )}
            <p>
              Your Prolific completion code is: <strong>{prolificCode}</strong>, you can also <a href={`https://app.prolific.com/submissions/complete?cc=${prolificCode}`} target="_blank" rel="noopener noreferrer">click here to return to Prolific and complete your submission.</a>
            </p>
          </>
        ),
      };
    },
  },
]);

export default function Experiment() {
  return (
    <ExperimentRunner
      timeline={experiment}
      components={{SamplingParadigm}}
      simulationConfig={simulationConfig}
    />
  );
}
