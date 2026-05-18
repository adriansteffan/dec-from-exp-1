/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExperimentRunner, sampleParticipants, prolificId, invokeLLM, uniform, getParam, sample, selectPrevTrialData, mean, prepareTimeline } from '@adriansteffan/reactive';
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

const VOICE_RECORDING_PARAGRAPHS = [
  'Please describe the two options you just had to decide between for a participant in an upcoming study. They will have to make a choice between the same two lotteries as you, but your description will be their main source of information.',
  'So unlike you, they will not be able to search for information themselves but will go straight to the decision screen after reading your description.',
  'Please include all the information you think is valuable to make an informed decision, including your personal reasons, as their bonus payment will also depend on their decision and therefore on the quality of the description you provide.',
];

const VOICE_RECORDING_PROMPT = VOICE_RECORDING_PARAGRAPHS.join('\n');

const VoiceRecordingBody = () => (
  <>{VOICE_RECORDING_PARAGRAPHS.map((p, i) => <p key={i}>{p}</p>)}</>
);


const simulationConfig = {
  seed: 42,
  participants: () => sampleParticipants('sobol', 10, {
    sampleCount: { distribution: 'discrete', outcomes: [{ value: 5, weight: 1 }, { value: 20, weight: 1 }, { value: 60, weight: 1 }] },
  }).map((p: any) => ({
    ...p,
    urlParams: { PROLIFIC_PID: prolificId() },
  })),
};

const samplingSimulators = {
  sampleSingle: (_tp: any, p: any) => {
    const target = Math.max(_tp.minSamples ?? 0, p.sampleCount ?? 20);
    if ((p.currentTrialMemory?.length ?? 0) >= target)
      return { value: { deck: -1, rt: 0 }, participantState: p };
    return { value: { deck: uniform(0, 1) > 0.5 ? 0 : 1, rt: uniform(300, 1500) }, participantState: p };
  },
  rememberSample: ({ sample }: any, p: any) => {
    return { participantState: { ...p, currentTrialMemory: [...(p.currentTrialMemory ?? []), sample] } };
  },
  decide: (_tp: any, p: any) => {
    const samples: any[] = p.currentTrialMemory ?? [];
    const means = [0, 1].map((d: number) =>
      mean(samples.filter((s: any) => s.deck === d).map((s: any) => s.value))
    );
    const choice = means[0] > means[1] ? 0 : means[1] > means[0] ? 1 : (uniform(0, 1) > 0.5 ? 0 : 1);
    return { value: choice, participantState: p };
  },
};

const voiceRecordingSimulators = {
  respondTTS: async (_input: any, participant: any) => {
    const trials = participant.trialMemory ?? {};
    const keys = Object.keys(trials);
    const s = keys.length ? trials[keys[keys.length - 1]] : null;
    const samplingLog = s?.samples?.length
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

const familiarisationDistributions: [any, any] = (() => {
  const risky = { type: 'discrete' as const, outcomes: [
    { value: 13.4, weight: 0.5 }, { value: 3.8, weight: 0.5 },
  ]};
  const safe = { type: 'discrete' as const, outcomes: [{ value: 9.9, weight: 1 }] };
  return uniform(0, 1) > 0.5 ? [safe, risky] : [risky, safe];
})();

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

function scoreTrials(data: any[]) {
  const trials = data.filter((d: any) => d.type === 'SamplingParadigm' && !d.name?.startsWith('familiarisation'));
  const scores = trials.map((d: any) => {
    const row = Array.isArray(d.responseData) ? d.responseData[0] : d.responseData;
    const choseRisky = row?.finalChoiceIndex === d.riskyDeckIndex;
    if (!choseRisky) return 5;
    const isRare = Math.abs(row?.finalValue - d.rareOutcomeValue) < 0.01;
    if (d.treasureDisaster === 'Disaster') return isRare ? 0 : 6;
    return isRare ? 10 : 4;
  });
  const meanScore = Math.min(mean(scores), 8);
  const hasShortRecording = data.filter((d: any) => d.type === 'VoiceRecording')
    .some((r: any) => (r.responseData?.recordingDuration ?? 0) < minRecordingDuration);
  const bonus = hasShortRecording ? 0 : Math.max(0, ((meanScore - 2) / (8 - 2)) * 1.5);
  return { scores, meanScore, hasShortRecording, bonus };
}

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
      wideLayout: true,
      headings: { saved: <>The outcome has been drawn from your chosen lottery.<br />You will see it at the end of the experiment!</> },
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
        <>
          <p>The {ordinal} scored trial is about to start.</p>
          <p>Please collect information about the two lotteries you can choose between by clicking the buttons on screen.</p>
          <p>Once you are ready to make a decision, click "Proceed to decision" to indicate which lottery you choose to determine part of your bonus payment.</p>
        </>
      ),
    },
  };
}

function makeVoiceRecording(name: string, isRepeat = false) {
  return {
    name,
    type: 'VoiceRecording',
    props: {
      content: isRepeat ? (
        <>
          <p>You will now record your experience again, but please note that this description will be given to a <strong>different participant</strong>, so do not be afraid to repeat aspects of your first description, the repetition is necessary.</p>
          <p>A reminder of the previous instructions:</p>
          <VoiceRecordingBody />
        </>
      ) : (
        <>
          <p>We will now ask you to record your experience with your microphone, <strong>so please read the following instructions carefully!</strong></p>
          <VoiceRecordingBody />
        </>
      ),
      minDuration: minRecordingDuration,
      shortRecordingWarning: <>Your recording seems quite short. Please add more detail so the next participant can make an informed choice. You can press the record button again to continue or use the trash button to start over.<br /><strong>If you proceed without adding to your recording, you will forego your bonus payment.</strong></>,
      silenceWarningSec: 5,
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
      buttonText: 'Continue',
      animate: true,
      content: (
        <>
          <h1><strong>Welcome!</strong></h1>
          <p>
            Thank you for your interest in this study. It will take approximately <strong>7 minutes</strong> to complete.
          </p>
          <p>
            You will be presented with a decision-making task involving lotteries. At the end, we will ask you about your experience - you won't have to type anything, we will <strong>record your voice</strong>.
          </p>
          <p>
            The recording itself will <strong>not</strong> be used for anything other than transcribing (ensuring that it is anonymous). The transcribed text will be processed further for research purposes.
          </p>
          <p>
            Please click the button below to proceed to the consent page.
          </p>
        </>
      ),
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
          <h3><strong>Participating in this Study</strong></h3>
          <p>
            Participation in this study is voluntary. You can withdraw at any time without indication of a reason by closing the browser window and returning your participation on Prolific before having completed the study. After withdrawing, however, you will not be allowed to participate again.
          </p>
          <p>
            The study will take approximately 7 minutes, during which you will be asked to make simple decisions about lotteries.
          </p>
          <h3><strong>Privacy</strong></h3>
          <p>
            With the exception of your Prolific ID, no identifying data will be collected. Only Prolific can identify you through your Prolific ID.
          </p>
          <p>
            Your voice recording will be transcribed and only the transcription will be used for analysis. The recording will be deleted after the transcription is checked for quality.
          </p>
          <h3><strong>De-identified Data</strong></h3>
          <p>
            The results and the de-identified data of this study will be published as part of scientific publications. The fully de-identified dataset will be openly available online in the interest of openness and transparency of science.
          </p>
          <h3><strong>Conscientious Participation</strong></h3>
          <p>
            Please take participation in this study seriously. Developing and conducting scientific studies takes a lot of time and money. We rely on your conscientious participation for the validity of our results.
          </p>
          <h3><strong>Remuneration</strong></h3>
          <p>
            For full participation in this study you will receive £0.75 via Prolific as base payment. In addition, you may receive a bonus payment of up to £1.50 that is dependent on your performance in the study. The bonus payment will be paid separately via Prolific.
          </p>
          <h3><strong>Consent</strong></h3>
          <p>
            I hereby confirm that I have understood the above information and agree to participate in the study.
          </p>
          <p>
            Please proceed with the study only if you intend to participate conscientiously and without interruptions. Otherwise, please go back to Prolific and return the study so another participant can partake.
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
    name: 'enter_fullscreen',
    type: 'EnterFullscreen',
    props: {
      animate: true,
      buttonText: 'Enter Fullscreen Mode',
      keepFullscreen: true,
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
            You will be making a few decisions between lotteries, represented by two buttons on the screen. There will be at most 5 trials, each with two phases:
          </p>
          <p>
            In the <strong>search phase</strong>, you can collect information about the current two lotteries by clicking them and seeing a randomly drawn outcome. Once you feel you know enough to make a decision, you can proceed to the next phase.
          </p>
          <p>
            In the <strong>decision phase</strong>, you will click one of the two lotteries to receive a randomly drawn outcome that will count towards your bonus. In this phase, you will not see what the outcome is. You will be shown all the lottery outcomes that resulted from your decisions at the end of the experiment.
          </p>
          <p>
            How well you perform will determine your bonus payment, which can <strong>amount to a maximum of £1.50</strong>.
          </p>
        </>
      ),
    },
  },
  {
    name: 'familiarisation_intro',
    type: 'Text',
    props: {
      buttonText: 'Continue',
      animate: true,
      content: (
        <>
          <p>Before you begin, you will get the chance to familiarise yourself with the basic task structure in a practice round, which will not count towards your bonus.</p>
          <p>To make sure you will get a precise impression, you will need to draw <strong>a minimum of 20 outcomes</strong> from the two lotteries.</p>
        </>
      ),
    },
  },
  {
    name: 'familiarisation_trial',
    type: 'SamplingParadigm',
    simulate: true,
    props: {
      distributions: familiarisationDistributions,
      labels: ['A', 'B'] as [string, string],
      keys: samplingKeys,
      hideResult: false,
      wideLayout: true,
      minSamples: 20,
      inactiveButtonText: 'Keep searching',
      continueButtonText: 'Continue to scored trials',
      headings: { result: <span className="text-lg" style={{ fontWeight: 400 }}><strong style={{ fontWeight: 700 }}>The outcome has been drawn from your chosen lottery.</strong><br />In the following, scored trials, you will not see the final<br />outcome immediately after your choice, but rather<br />at the end of the experiment.</span> },
    },
    simulators: samplingSimulators,
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
    makeVoiceRecording('voicerecording_2', true),
  ]},
  { type: 'IF_BLOCK', cond: (_d: any, store: any) => !store.rareEventSeen, timeline: [
    makeSamplingInstruction('instruction_test_1'),
    makeSamplingTrial(trialConfigs[3], 'test_1'),
    makeVoiceRecording('voicerecording_1'),
    makeSamplingInstruction('instruction_test_2'),
    makeSamplingTrial(trialConfigs[4], 'test_2'),
    makeVoiceRecording('voicerecording_2', true),
  ]},
  { type: 'UPDATE_STORE', fun: (data: any) => {
    const { scores, meanScore, hasShortRecording, bonus } = scoreTrials(data);
    return { scores, meanScore, hasShortRecording, bonus };
  }},
  {
    name: 'upload',
    type: 'Upload',
    props: (_data: any, store: any) => ({
      autoUpload: false,
      sessionData: { bonus: store.bonus, meanScore: store.meanScore, hasShortRecording: store.hasShortRecording },
    }),
  },
  {
    name: 'exit_fullscreen',
    type: 'ExitFullscreen',
    props: {},
  },
  {
    name: 'finaltext',
    type: 'Text',
    props: (data: any, store: any) => {
      const prolificCode = import.meta.env?.VITE_PROLIFIC_CODE || 'PROLIFIC_CODE_HERE';

      const trials = data.filter((d: any) => d.type === 'SamplingParadigm');
      const outcomes = trials.map((d: any, i: number) => {
        const row = Array.isArray(d.responseData) ? d.responseData[0] : d.responseData;
        return { trial: i + 1, name: d.name, choice: row?.finalChoice ?? '?', value: row?.finalValue ?? 0 };
      });

      const { hasShortRecording, bonus } = store;
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
            <hr style={{ margin: '1.5rem 0', borderColor: '#ccc' }} />
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>About this study (click to read)</summary>
              <div style={{ marginTop: '0.75rem' }}>
                <p>
                  The aim of this study is to examine decision making between risky options (e.g. lotteries) when the options are experienced through drawing outcomes from them. In further studies, we will compare this type of information about options with others: statistical summaries of the probabilities of the lotteries and, thanks to you, written transcriptions of people's spontaneous descriptions.
                </p>
                <p>
                  Depending on what aspects the descriptions emphasise, we expect participants' decision behaviour in the next experiments to be closer to the experience-based condition or the statistical-summary condition.
                </p>
                <p>
                  Your participation is very valuable to us and we want to thank you very much! Feel free to contact us if you would like to be notified of scientific publications based on your data.
                </p>
              </div>
            </details>
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
