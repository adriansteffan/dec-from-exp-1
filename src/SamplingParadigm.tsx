/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BaseComponentProps, registerFlattener, registerSimulation, arrayFlattener, uniform, draw, mean, useTheme, t } from '@adriansteffan/reactive';


type DistributionConfig =
  | { type: 'uniform'; min: number; max: number }
  | { type: 'normal'; mean: number; sd: number }
  | { type: 'discrete'; outcomes: Array<{ value: number; weight: number }> };

interface Sample {
  deck: number;
  value: number;
  order: number;
  timestamp: number;
}

type Phase = 'sampling' | 'deciding' | 'result' | 'saved';

interface SamplingParadigmProps extends BaseComponentProps {
  distributions: [DistributionConfig, DistributionConfig];
  labels?: [string, string];
  keys?: [string, string];
  hideResult?: boolean;
  decisionOnly?: boolean;
  introAnimation?: boolean;
  decimalPlaces?: number;
  headings?: Partial<Record<Phase, string>>;
}

function drawFromDistribution({ type, ...rest }: DistributionConfig): number {
  return draw({ distribution: type, ...rest } as any);
}

registerFlattener('SamplingParadigm', 'samplingparadigm', arrayFlattener);

registerSimulation('SamplingParadigm', (trialProps, _es, simulators, participant) => {
  const dists = trialProps.distributions as [DistributionConfig, DistributionConfig];
  const labels = (trialProps.labels as [string, string]) || ['A', 'B'];

  let samples: Sample[] = [];
  if (!trialProps.decisionOnly) {
    let time = 0;
    for (let i = 0; ; i++) {
      const res = simulators.sampleSingle({ ...trialProps, samplesSoFar: samples, order: i }, participant);
      participant = res.participantState;
      const { deck, rt } = res.value as { deck: number; rt: number };
      time += rt;
      if (deck === -1) break;
      samples.push({ deck, value: drawFromDistribution(dists[deck]), order: i, timestamp: time });
    }
  }

  const dec = simulators.decide({ ...trialProps, samples }, participant);
  const idx = dec.value as number;
  participant = dec.participantState;
  const finalValue = drawFromDistribution(dists[idx]);
  const samplingDuration = samples.length ? samples[samples.length - 1].timestamp : 0;
  const decisionDuration = uniform(500, 3000);
  const shared = {
    finalChoice: labels[idx], finalChoiceIndex: idx, finalValue,
    hideResult: !!trialProps.hideResult, decisionOnly: !!trialProps.decisionOnly,
    totalSamples: samples.length,
    samplingDuration, decisionDuration, totalTime: samplingDuration + decisionDuration,
    distributionA: JSON.stringify(dists[0]),
    distributionB: JSON.stringify(dists[1]),
  };
  
  const responseData = samples.length === 0
    ? [shared]
    : samples.map((s) => ({ ...s, ...shared }));

  const lastSampling = {
    samples, finalChoice: labels[idx], finalChoiceIndex: idx,
    ...(trialProps.hideResult ? {} : { finalValue }),
  };

  return {
    responseData,
    participantState: { ...participant, lastSampling },
    duration: samplingDuration + decisionDuration,
  };
}, {
  sampleSingle: (tp: any, participant: any) => {
    if ((tp.samplesSoFar?.length ?? 0) >= 15) return { value: { deck: -1, rt: 0 }, participantState: participant };
    return { value: { deck: uniform(0, 1) > 0.5 ? 0 : 1, rt: uniform(300, 1500) }, participantState: participant };
  },
  decide: (trialProps: any, participant: any) => {
    const samples: Sample[] = trialProps.samples || [];
    const means = [0, 1].map((d) =>
      mean(samples.filter((s) => s.deck === d).map((s) => s.value))
    );
    const choice = means[0] > means[1] ? 0 : means[1] > means[0] ? 1 : (uniform(0, 1) > 0.5 ? 0 : 1);
    return { value: choice, participantState: participant };
  },
});


const CARD_ANIMATE = { opacity: 1, x: 0, scale: 1 };
const CARD_EXIT = { opacity: 0, transition: { duration: 0 } };
const CARD_TRANSITION = { duration: 0.3, ease: 'easeOut' as const };
const DECK_EXIT = { opacity: 0, transition: { duration: 0.4 } };

const DECK_CARD_CLASS = 'absolute inset-0 bg-white border-2 border-black rounded-xl';
const DECK_FRONT_BASE = 'relative z-10 w-44 h-60 bg-white border-2 border-black rounded-xl flex items-center justify-center select-none';

const KEY_LABELS: Record<string, string> = {
  arrowleft: '\u2190', arrowright: '\u2192', arrowup: '\u2191', arrowdown: '\u2193',
  ' ': 'Space', enter: '\u21B5',
};
function keyLabel(key: string) { return KEY_LABELS[key.toLowerCase()] ?? key.toLowerCase(); }

const CARD_LAYERS = [
  { offset: 'translate-x-[8px] translate-y-[8px]', delay: 0 },
  { offset: 'translate-x-[4px] translate-y-[4px]', delay: 0.1 },
  { offset: '', delay: 0.2 }, // top card
];

function Deck({ label, onClick, disabled, side, animate: introAnimation = true }: { label: string; onClick: () => void; disabled?: boolean; side: 'left' | 'right'; animate?: boolean }) {
  return (
    <div className="relative w-44 h-60">
      {CARD_LAYERS.map((layer, i) => {
        const isTop = i === CARD_LAYERS.length - 1;
        const introProps = introAnimation ? {
          initial: { y: -400, x: side === 'left' ? -300 : 300, rotate: side === 'left' ? -20 : 20, opacity: 0 },
          animate: { y: 0, x: 0, rotate: 0, opacity: 1 },
          transition: { delay: layer.delay, duration: 0.5, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
        } : {};

        if (isTop) {
          return (
            <motion.div
              key={i}
              className="absolute inset-0"
              {...introProps}
            >
              <button
                onClick={onClick}
                disabled={disabled}
                tabIndex={-1}
                className={`${DECK_FRONT_BASE} transition-transform duration-150 ${disabled ? '' : 'cursor-pointer hover:-translate-y-1.5'}`}
              >
                <div className="absolute inset-2 border-2 border-black rounded-lg pointer-events-none" />
                <span className="relative text-4xl font-black">{label}</span>
              </button>
            </motion.div>
          );
        }
        return (
          <motion.div
            key={i}
            className={`${DECK_CARD_CLASS} ${layer.offset}`}
            {...introProps}
          />
        );
      })}
    </div>
  );
}

export default function SamplingParadigm({
  next, distributions, labels = ['A', 'B'], keys, hideResult = false, decisionOnly = false, introAnimation = true, decimalPlaces = 1, headings: customHeadings,
}: SamplingParadigmProps) {
  const th = t(useTheme());
  const [phase, setPhase] = useState<Phase>(decisionOnly ? 'deciding' : 'sampling');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [latestCard, setLatestCard] = useState<{ deck: number; value: number; key: number } | null>(null);
  const [final_, setFinal] = useState<{ choice: number; value: number } | null>(null);
  const cardKey = useRef(0);
  const startTime = useRef(performance.now());
  const samplingEnd = useRef(0);
  const handleDrawRef = useRef((_deck: number) => {});

  const btnClass = `${th.buttonBg} cursor-pointer px-8 py-3 border-2 ${th.buttonBorder} font-bold ${th.buttonText} text-lg rounded-xl ${th.buttonShadow} hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all duration-150`;

  const handleDraw = (deck: number) => {
    if (phase !== 'sampling' && phase !== 'deciding') return;
    const value = drawFromDistribution(distributions[deck]);

    cardKey.current++;
    if (phase === 'sampling') {
      setSamples((prev) => [...prev, { deck, value, order: prev.length, timestamp: performance.now() - startTime.current }]);
      setLatestCard({ deck, value, key: cardKey.current });
    } else {
      if (!samplingEnd.current) samplingEnd.current = performance.now();
      setFinal({ choice: deck, value });
      if (!hideResult) {
        setLatestCard({ deck, value, key: cardKey.current });
        setPhase('result');
      } else {
        setLatestCard(null);
        setPhase('saved');
      }
    }
  };

  handleDrawRef.current = handleDraw;

  useEffect(() => {
    if (!keys) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === keys[0].toLowerCase()) handleDrawRef.current(0);
      else if (k === keys[1].toLowerCase()) handleDrawRef.current(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keys]);

  const handleProceed = () => {
    samplingEnd.current = performance.now();
    setLatestCard(null);
    setPhase('deciding');
  };

  const handleContinue = () => {
    const now = performance.now();
    const samplingDuration = samplingEnd.current ? samplingEnd.current - startTime.current : 0;
    const decisionDuration = samplingEnd.current ? now - samplingEnd.current : now - startTime.current;
    const shared = {
      finalChoice: labels[final_!.choice], finalChoiceIndex: final_!.choice, finalValue: final_!.value,
      hideResult, decisionOnly, totalSamples: samples.length, totalTime: now - startTime.current,
      samplingDuration, decisionDuration,
      distributionA: JSON.stringify(distributions[0]),
      distributionB: JSON.stringify(distributions[1]),
    };
    if (samples.length === 0) {
      next([shared]);
    } else {
      next(samples.map((s) => ({ ...s, ...shared })));
    }
  };

  const defaultHeadings: Record<Phase, string> = {
    sampling: 'Click the lotteries to draw a result!',
    deciding: 'Which lottery do you want to draw your reward from?',
    result: "Here's your result!",
    saved: 'Your choice has been saved!',
  };
  const heading = customHeadings?.[phase] ?? defaultHeadings[phase];

  const showMiddle = !(hideResult && phase !== 'sampling');
  const decided = phase === 'result' || phase === 'saved';

  const cardInitial = (deck: number) => ({
    opacity: 1, x: deck === 0 ? -200 : 200, scale: 0.8,
  });

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center ${th.containerBg} p-8 overflow-hidden`}>
      <h2 className={`text-2xl font-bold ${th.text} text-center mb-16`}>
        {heading}
      </h2>

      {/* Decks + middle card area */}
      <div className="flex items-center justify-center gap-12">
        <AnimatePresence>
          {[0, 1].map((idx) => {
            const side = idx === 0 ? 'left' as const : 'right' as const;
            const isChosen = final_?.choice === idx;
            const visible = hideResult ? (!decided || isChosen) : true;
            const shouldFade = !hideResult && decided && !isChosen;
            if (!visible) return null;
            return (
              <motion.div
                key={`deck-${idx}-wrap`}
                layout={hideResult}
                exit={DECK_EXIT}
                animate={{ opacity: shouldFade ? 0 : 1 }}
                transition={{ duration: 0.4 }}
                style={{ order: idx * 2 }}
              >
                <Deck label={labels[idx]} onClick={() => handleDraw(idx)} disabled={decided} side={side} animate={introAnimation} />
              </motion.div>
            );
          })}
          {keys && (
            <>
              <span className={`px-3.5 py-1.5 bg-white border-2 border-black rounded-lg font-bold text-lg select-none shadow-[0_3px_0_-2px_white,0_3px_0_0px_black] transition-opacity duration-400 ${decided ? 'opacity-0 pointer-events-none' : ''}`} style={{ order: -1 }}>
                {keyLabel(keys[0])}
              </span>
              <span className={`px-3.5 py-1.5 bg-white border-2 border-black rounded-lg font-bold text-lg select-none shadow-[0_3px_0_-2px_white,0_3px_0_0px_black] transition-opacity duration-400 ${decided ? 'opacity-0 pointer-events-none' : ''}`} style={{ order: 3 }}>
                {keyLabel(keys[1])}
              </span>
            </>
          )}

          {/* nitpicky UI thing: mt-[8px] aligns with the top deck card, which is offset by the stacked layers below it */}
          {showMiddle && (
            <motion.div layout={hideResult} className="w-44 h-60 flex items-center justify-center relative mt-[8px]" style={{ order: 1 }}>
              {phase === 'deciding' && !hideResult && !latestCard && (
                <span className={`text-3xl font-black ${th.text} select-none`}>vs.</span>
              )}
              {samples.length === 0 && phase === 'sampling' && (
                <div className="absolute inset-0 border-2 border-dashed border-gray-300 rounded-xl" />
              )}
              <AnimatePresence mode="wait">
                {latestCard && (
                  <motion.div
                    key={latestCard.key}
                    className="absolute inset-0 bg-white border-2 border-black rounded-xl flex items-center justify-center select-none"
                    initial={cardInitial(latestCard.deck)}
                    animate={CARD_ANIMATE}
                    exit={CARD_EXIT}
                    transition={CARD_TRANSITION}
                  >
                    <span className="absolute top-2 left-3 text-xs font-bold text-gray-500">
                      {labels[latestCard.deck]}
                    </span>
                    <span className="absolute bottom-2 right-3 text-xs font-bold text-gray-500 rotate-180">
                      {labels[latestCard.deck]}
                    </span>
                    <span className="text-3xl font-black">
                      {latestCard.value.toFixed(decimalPlaces)}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom button */}
      <div className="h-12 mt-24">
        {phase === 'sampling' && (
          <button className={btnClass} onClick={handleProceed} tabIndex={-1}>
            Proceed to decision
          </button>
        )}
        {decided && (
          <button className={btnClass} onClick={handleContinue} tabIndex={-1}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}
