/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { useTheme, t } from '@adriansteffan/reactive';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2';

// the number of draws visible in one scrolling width should be constant per participant
const VISIBLE = 18;
const CARD_W = 40;
const CARD_H = 56;
const COL_GAP = 4;
const ROW_GAP = 10;
const NUM_H = 14;

const COL = CARD_W + COL_GAP;
const PAGE = VISIBLE * COL;

const CARD_BASE = 'rounded-md border-2 flex items-center justify-center shrink-0 select-none';

// Miniature of the deck from the sampling screen, so the rows are recognisable.
// The stack runs upwards out of the box: the hindmost (lowest) card fills the row, and the
// front card overhangs above it, so the deck's baseline lines up with the card rows.
const STACK = 3;
const MiniDeck = ({ label }: { label: string }) => (
  <div className='relative shrink-0' style={{ width: CARD_W, height: CARD_H }}>
    {[0, -STACK].map((o) => (
      <div
        key={o}
        className='absolute inset-0 bg-white border-2 border-black rounded-md'
        style={{ transform: `translate(${o}px, ${o}px)` }}
      />
    ))}
    <div
      className='absolute inset-0 bg-white border-2 border-black rounded-md flex items-center justify-center'
      style={{ transform: `translate(${-2 * STACK}px, ${-2 * STACK}px)` }}
    >
      <span className='relative font-black' style={{ fontSize: 16 }}>
        {label}
      </span>
    </div>
  </div>
);

export default function OutcomeSequence({
  samples,
  labels = ['A', 'B'],
  decimalPlaces = 1,
}: {
  samples: any[];
  labels?: [string, string];
  decimalPlaces?: number;
}) {
  const th = t(useTheme());
  const strip = useRef<HTMLDivElement>(null);
  const target = useRef(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(() => samples.length <= VISIBLE);

  // Which arrows are usable. Hidden ones keep their slot so the strip never shifts.
  const updateEdges = () => {
    const el = strip.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= max - 1);
  };

  useEffect(() => {
    updateEdges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples.length]);

  const scroll = (dir: number) => {
    const el = strip.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    target.current = Math.min(max, Math.max(0, (Math.round(target.current / PAGE) + dir) * PAGE));
    el.scrollTo({ left: target.current, behavior: 'smooth' });
  };

  // Keep the arrows in step if the strip gets scrolled by hand.
  const syncTarget = () => {
    if (strip.current) target.current = strip.current.scrollLeft;
  };

  const arrow = (dir: number, Icon: typeof HiChevronLeft, hidden: boolean) => (
    <button
      onClick={() => scroll(dir)}
      tabIndex={-1}
      className={`${th.buttonBg} ${th.buttonText} border-2 ${th.buttonBorder} ${th.buttonShadow} shrink-0 rounded-lg p-1 cursor-pointer hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${hidden ? 'invisible' : ''}`}
    >
      <Icon className='w-5 h-5' />
    </button>
  );

  // Sampled deck shows the outcome; the other shows a faded card back.
  const cell = (s: any, deck: number) =>
    s.deck === deck ? (
      <div
        className={`${CARD_BASE} bg-white border-black font-black tabular-nums`}
        style={{ width: CARD_W, height: CARD_H, fontSize: 11 }}
      >
        {s.value.toFixed(decimalPlaces)}
      </div>
    ) : (
      <div
        className={`${CARD_BASE} bg-white border-black opacity-30 p-1`}
        style={{ width: CARD_W, height: CARD_H }}
      >
        <div className='w-full h-full border border-black rounded-sm' />
      </div>
    );

  if (!samples.length) return null;

  // Shrink to the content when the sequence is short, so the strip does not reserve a
  // full page of empty space and leave the whole reminder sitting off-centre.
  const contentW = samples.length * COL - COL_GAP;

  return (
    <div
      className='not-prose relative left-1/2 -translate-x-1/2 w-max flex items-center mt-10 mb-14'
      style={{ gap: 10 }}
    >
      {arrow(-1, HiChevronLeft, atStart)}

      {/* the decks' front cards overhang 2*STACK to the left, so give that back as margin */}
      <div className='flex flex-col shrink-0' style={{ gap: ROW_GAP, marginLeft: 2 * STACK }}>
        <div style={{ height: NUM_H }} />
        <MiniDeck label={labels[0]} />
        <MiniDeck label={labels[1]} />
      </div>

      <div
        ref={strip}
        onWheel={syncTarget}
        onScroll={updateEdges}
        className='overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        style={{ width: Math.min(PAGE, contentW) }}
      >
        <div className='flex w-max' style={{ gap: COL_GAP }}>
          {samples.map((s, i) => (
            <div key={i} className='flex flex-col items-center' style={{ gap: ROW_GAP }}>
              <div
                className={`${th.text} opacity-50 tabular-nums leading-none flex items-end`}
                style={{ height: NUM_H, fontSize: 10 }}
              >
                {i + 1}
              </div>
              {cell(s, 0)}
              {cell(s, 1)}
            </div>
          ))}
        </div>
      </div>

      {arrow(1, HiChevronRight, atEnd)}
    </div>
  );
}
