import { describe, it, expect } from 'vitest'
import { parseWorkoutPaste, parseLoad, parseSets, parseReps } from './workoutPaste'

// Build TSV lines without embedding literal tabs in the source.
const L = (...cells: string[]) => cells.join('\t')

/** The user's real Nov-2025 paste (columns A–E of the coach sheet, verbatim). */
const NOV_WEEK = [
  L('03/11/2025', '', '', '', '', ''),
  L('Monday', '', '', '', '', ''),
  L('Rear Delt Flyes', '55', '3', '12', '55 6r @10, 36.5 8r @10, 31.5 9r @10', ''),
  L('', '', '', '', '', ''),
  L('BTN Press', 'Load', 'Sets', 'Reps', '', ''),
  L('', '27.5', '3', '10', "Did 29kg, they don't have 1.25kg weights ", ''),
  L('', '', '', '', '', ''),
  L('Chest Supported Row', '50', '3', '10', '', ''),
  L('', '', '', '', '', ''),
  L('Spoto Bench Press', 'Load', 'Sets', 'Reps', '', ''),
  L('https://www.youtube.com/watch?v=2mn_NyAchgM', '65', '4', '7', 'This was so hard', ''),
  L('', '', '', '', '', ''),
  L('Lat Pulldown', '40.5', '3', '12', '', ''),
  L('', '', '', '', '', ''),
  L('Preacher Curl', '30lb', '3', '10', 'Last amrap 17', ''),
  L('', '', '', '', '', ''),
  L('Tricep Extension', '50lb', '3', '12', 'I switched to the extension machine', ''),
  L('', '', '', '', '', ''),
  L('Lateral Raise Machine', '22.5', '3', '12', '', ''),
  L('Tuesday', '', '', '', '', ''),
  L('Bike', '', '1', '5m', 'Done', ''),
  L('', '', '', '', '', ''),
  L('High Bar Squat', 'Load', 'Sets', 'Reps', '', ''),
  L('', '105', '1', '5', '', 'Not sure about @, but core unstable af'),
  L('', '', '', '', '', ''),
  L('3-2-0 Tempo Squat', '70', '3', '5', '', '72kg'),
  L('', '', '', '', '', ''),
  L('Deficit Paused Deadlift', 'Load', 'Sets', 'Reps', '', ''),
  L('Pause off the floor', '105', '7', '2', '60s rest', '123456'),
  L('', '', '', '', '', ''),
  L('Leg Extensions', '30', '3', '15', '12 @10, 8 @10, 8 @10', ''),
  L('', '', '', '', '', ''),
  L('Decline Sit Up', '5', '2', '10', 'Best back relief', ''),
  L('', '', '', '', '', ''),
  L('Back Raises', '15', '2', '15', '', ''),
  L('', '', '', '', '', ''),
  L('Cardio of Choice', '', '1', '2-30 min', 'Literally anything', ''),
  L('Wednesday', '', '', '', '', ''),
  L('Pause Bench Press', 'Load', 'Sets', 'Reps', '', ''),
  L('2-count puase on your chest', '70', '5', '5', '', ''),
  L('', '', '', '', '', ''),
  L('Assisted Chin Up', '15p', '3', '10', '', ''),
  L('', '', '', '', '', ''),
  L('Med Incline DB Bench Press', '25lb', '3', '20', '30lb 14 @8, 25lb 15 @9, ', ''),
  L('', '', '', '', '', ''),
  L('Bayesian Curl', '2p', '3', '12', '', ''),
  L('', '', '', '', '', ''),
  L('Tate Press', '25lb', '3', '12', '20, 25, 30 (30 too hard)', ''),
  L('', '', '', '', '', ''),
  L('EZ Bar Reverse Curl', '30lb', '2', '15', 'Never remove this', ''),
  L('Thursday'),
  L('Bike', '', '1', '5m', '', ''),
  L('', '', '', '', '', ''),
  L('Conventional Deadlift', 'Load', 'Sets', 'Reps', '', ''),
  L('', '125', '5', '3', '', ''),
  L('', '', '', '', '', ''),
  L('', '', '', '', '', ''),
  L('', '', '', '', '', ''),
  L('Hamstring Curl', '33kg', '3', '12', 'Idk why but I failed', ''),
  L('', '', '', '', '', ''),
  L('Bulgarian Split Squat', '55lb', '3', '8', '', ''),
  L('', '', '', '', '', ''),
  L('Cable Twists', '', '3', '10', '', ''),
  L('', '', '', '', '', ''),
  L('Cardio of Choice', '', '1', '2-30 min', 'Literally anything', ''),
  L('Friday', '', '', '', '', ''),
  L('Bike', '', '1', '5m', '', ''),
  L('', '', '', '', '', ''),
  L('Pogo Jumps', '', '2', '20', '', ''),
  L('', '', '', '', '', ''),
  L('Seated Vertical Jump', '', '3', '5', '', ''),
  L('', '', '', '', '', ''),
  L('HK Scoop Throw', '', '2', '15', '', ''),
  L('', '', '', '', '', ''),
  L('Seated Calf Raises', '', '3', '12', '', ''),
  L('', '', '', '', '', ''),
  L('Smith Side Bends', '', '3', '8', '', ''),
  L('', '', '', '', '', ''),
  L('Cardio of Choice', '', '1', '10-30 min', 'Literally anything'),
].join('\n')

describe('parseLoad', () => {
  it('plain numbers are kg', () => {
    expect(parseLoad('105')).toEqual({ kg: 105 })
    expect(parseLoad('27.5')).toEqual({ kg: 27.5 })
  })
  it('explicit kg suffix', () => {
    expect(parseLoad('33kg')).toEqual({ kg: 33 })
  })
  it('lb converts and keeps text', () => {
    expect(parseLoad('30lb')).toEqual({ kg: 13.6, text: '30lb' })
    expect(parseLoad('55lb')).toEqual({ kg: 24.9, text: '55lb' })
    expect(parseLoad('30 lbs')).toEqual({ kg: 13.6, text: '30 lbs' })
  })
  it('non-numeric loads keep text with 0 kg', () => {
    expect(parseLoad('BW')).toEqual({ kg: 0, text: 'BW' })
    expect(parseLoad('15p')).toEqual({ kg: 0, text: '15p' })
    expect(parseLoad('20/Empty bar')).toEqual({ kg: 0, text: '20/Empty bar' })
  })
  it('empty load is bodyweight (0, no text)', () => {
    expect(parseLoad('')).toEqual({ kg: 0 })
    expect(parseLoad('  ')).toEqual({ kg: 0 })
  })
})

describe('parseSets', () => {
  it('plain ints (and Excel floats)', () => {
    expect(parseSets('3')).toEqual({ sets: 3 })
    expect(parseSets('3.0')).toEqual({ sets: 3 })
  })
  it('empty defaults to 1', () => {
    expect(parseSets('')).toEqual({ sets: 1 })
  })
  it('text becomes a remark', () => {
    expect(parseSets('50 reps in as few sets as possible')).toEqual({
      sets: 1,
      remark: '50 reps in as few sets as possible',
    })
  })
})

describe('parseReps', () => {
  it('plain ints', () => {
    expect(parseReps('12')).toEqual({ reps: 12 })
    expect(parseReps('12.0')).toEqual({ reps: 12 })
  })
  it('leading int keeps full text', () => {
    expect(parseReps('8-10')).toEqual({ reps: 8, text: '8-10' })
    expect(parseReps('5m')).toEqual({ reps: 5, text: '5m' })
    expect(parseReps('2-30 min')).toEqual({ reps: 2, text: '2-30 min' })
  })
  it('no leading int defaults to 1 with text', () => {
    expect(parseReps('@8')).toEqual({ reps: 1, text: '@8' })
    expect(parseReps('AMRAP @7-8')).toEqual({ reps: 1, text: 'AMRAP @7-8' })
  })
  it('empty defaults to 1, no text', () => {
    expect(parseReps('')).toEqual({ reps: 1 })
  })
})

describe('parseWorkoutPaste — Nov 2025 real paste', () => {
  const weeks = parseWorkoutPaste(NOV_WEEK)

  it('parses one week dated 2025-11-03 with Mon–Fri', () => {
    expect(weeks).toHaveLength(1)
    expect(weeks[0].date).toBe('2025-11-03')
    expect(weeks[0].days.map((d) => d.name)).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    ])
  })

  it('derives day dates from the week date by weekday offset', () => {
    const dates = weeks[0].days.map((d) => d.date)
    expect(dates).toEqual(['2025-11-03', '2025-11-04', '2025-11-05', '2025-11-06', '2025-11-07'])
  })

  it('finds the right exercise counts per day', () => {
    expect(weeks[0].days.map((d) => d.exercises.length)).toEqual([8, 8, 6, 6, 7])
  })

  it('parses a single-line exercise with comment', () => {
    const ex = weeks[0].days[0].exercises[0]
    expect(ex.name).toBe('Rear Delt Flyes')
    expect(ex.loadKg).toBe(55)
    expect(ex.loadText).toBeUndefined()
    expect(ex.sets).toBe(3)
    expect(ex.reps).toBe(12)
    expect(ex.remarks).toEqual(['55 6r @10, 36.5 8r @10, 31.5 9r @10'])
  })

  it('parses a Load/Sets/Reps header block', () => {
    const ex = weeks[0].days[0].exercises[1]
    expect(ex.name).toBe('BTN Press')
    expect(ex.loadKg).toBe(27.5)
    expect(ex.sets).toBe(3)
    expect(ex.reps).toBe(10)
    expect(ex.remarks).toEqual(["Did 29kg, they don't have 1.25kg weights"])
  })

  it('turns a URL in the data row into a remark', () => {
    const ex = weeks[0].days[0].exercises[3]
    expect(ex.name).toBe('Spoto Bench Press')
    expect(ex.loadKg).toBe(65)
    expect(ex.sets).toBe(4)
    expect(ex.reps).toBe(7)
    expect(ex.remarks).toContain('https://www.youtube.com/watch?v=2mn_NyAchgM')
    expect(ex.remarks).toContain('This was so hard')
  })

  it('keeps lb loads as text with converted kg', () => {
    const ex = weeks[0].days[0].exercises[5]
    expect(ex.name).toBe('Preacher Curl')
    expect(ex.loadText).toBe('30lb')
    expect(ex.loadKg).toBe(13.6)
    expect(ex.remarks).toEqual(['Last amrap 17'])
  })

  it('keeps machine-plate loads as text with 0 kg', () => {
    const chinUp = weeks[0].days[2].exercises[1]
    expect(chinUp.name).toBe('Assisted Chin Up')
    expect(chinUp.loadText).toBe('15p')
    expect(chinUp.loadKg).toBe(0)
  })

  it('turns a cue in the data-row first cell into a remark', () => {
    const ex = weeks[0].days[1].exercises[3]
    expect(ex.name).toBe('Deficit Paused Deadlift')
    expect(ex.loadKg).toBe(105)
    expect(ex.sets).toBe(7)
    expect(ex.reps).toBe(2)
    expect(ex.remarks).toContain('Pause off the floor')
    expect(ex.remarks).toContain('60s rest')
  })

  it('collects comments from any trailing column', () => {
    const squat = weeks[0].days[1].exercises[1]
    expect(squat.name).toBe('High Bar Squat')
    expect(squat.remarks).toContain('Not sure about @, but core unstable af')
    const tempo = weeks[0].days[1].exercises[2]
    expect(tempo.remarks).toContain('72kg')
  })

  it('handles cardio rows: empty load, duration reps, coach comment', () => {
    const cardio = weeks[0].days[1].exercises[7]
    expect(cardio.name).toBe('Cardio of Choice')
    expect(cardio.loadKg).toBe(0)
    expect(cardio.loadText).toBeUndefined()
    expect(cardio.reps).toBe(2)
    expect(cardio.repsText).toBe('2-30 min')
    expect(cardio.remarks).toEqual(['Literally anything'])
    const bike = weeks[0].days[1].exercises[0]
    expect(bike.repsText).toBe('5m')
    expect(bike.remarks).toEqual(['Done'])
  })

  it('parses an explicit kg load', () => {
    const ham = weeks[0].days[3].exercises[2]
    expect(ham.name).toBe('Hamstring Curl')
    expect(ham.loadKg).toBe(33)
    expect(ham.loadText).toBeUndefined()
  })
})

describe('parseWorkoutPaste — ramp blocks (Week 1-4 sheet)', () => {
  const RAMP = [
    L('Squat w/Belt', 'Load', 'Sets', 'Reps', 'Notes'),
    L('', '20/Empty bar', '2', '5'),
    L('', '40', '1', '5'),
    L('', '60', '1', '3'),
    L('', '70', '1', '3'),
    L('', '80', '1', '2', '', 'RPE'),
    L('', '82.5', '2', '5', '', '7'),
    L('', '82.5', '1', 'AMRAP @7-8', 'Rest: 2-5 mins', '7.5'),
  ].join('\n')

  it('collapses a multi-row block into the top working set + ramp remark', () => {
    const weeks = parseWorkoutPaste(RAMP)
    expect(weeks).toHaveLength(1)
    const ex = weeks[0].days[0].exercises[0]
    expect(ex.name).toBe('Squat w/Belt')
    expect(ex.loadKg).toBe(82.5)
    expect(ex.sets).toBe(2)
    expect(ex.reps).toBe(5)
    const ramp = ex.remarks.find((r) => r.startsWith('Ramp:'))
    expect(ramp).toBe('Ramp: 20/Empty bar×2×5, 40×1×5, 60×1×3, 70×1×3, 80×1×2')
    expect(ex.remarks).toContain('+ 82.5×1×AMRAP @7-8')
    expect(ex.remarks).toContain('Rest: 2-5 mins')
  })
})

describe('parseWorkoutPaste — wellness rows and supersets (FebMarch sheet)', () => {
  const FEBMARCH = [
    L('2026-02-23 00:00:00'),
    L('Sleep Quality', 'Fatigue', 'Desire to Train', '', '', 'Stress'),
    L('Enter Value', 'Enter Value', 'Enter Value', '', '', 'Enter Value'),
    L('Monday'),
    L('Cardio Warm Up', '', '1', '5m'),
    L(''),
    L('Bicep Curls', '', '50 reps in as few sets as possible', '', 'Pick a weight you can do for 12-15 reps. 1 min rest between rounds'),
    L('Superset'),
    L('Tricep Pushdowns'),
    L('Superset'),
    L('Lateral Raises'),
  ].join('\n')

  const weeks = parseWorkoutPaste(FEBMARCH)

  it('skips wellness header + value rows and reads the ISO date', () => {
    expect(weeks).toHaveLength(1)
    expect(weeks[0].date).toBe('2026-02-23')
    expect(weeks[0].days[0].name).toBe('Monday')
    expect(weeks[0].days[0].exercises.map((e) => e.name)).toEqual([
      'Cardio Warm Up', 'Bicep Curls', 'Tricep Pushdowns', 'Lateral Raises',
    ])
  })

  it('non-numeric sets become a remark; superset members are linked', () => {
    const [, curls, pushdowns, raises] = weeks[0].days[0].exercises
    expect(curls.sets).toBe(1)
    expect(curls.remarks).toContain('50 reps in as few sets as possible')
    expect(curls.remarks).toContain('Pick a weight you can do for 12-15 reps. 1 min rest between rounds')
    expect(pushdowns.remarks).toContain('Superset with previous')
    expect(pushdowns.sets).toBe(1)
    expect(pushdowns.reps).toBe(1)
    expect(raises.remarks).toContain('Superset with previous')
  })
})

describe('parseWorkoutPaste — structure variants', () => {
  it('handles "Day N" headers without dates', () => {
    const weeks = parseWorkoutPaste([
      L('Day 2'),
      L('Rear Delt Flyes', '40.5', '3', '12'),
    ].join('\n'))
    expect(weeks[0].days[0].name).toBe('Day 2')
    expect(weeks[0].days[0].date).toBeUndefined()
  })

  it('tolerates misspelled weekdays', () => {
    const weeks = parseWorkoutPaste([
      L('Wenesday'),
      L('Bench Press', '60', '5', '5'),
    ].join('\n'))
    expect(weeks[0].days[0].name).toBe('Wednesday')
  })

  it('parses combined day+date lines', () => {
    const weeks = parseWorkoutPaste([
      L('Thursday 25/12/25'),
      L('Bench Press', '60', '5', '5'),
    ].join('\n'))
    expect(weeks[0].days[0].name).toBe('Thursday')
    expect(weeks[0].days[0].date).toBe('2025-12-25')
  })

  it('reads week label lines with a date', () => {
    const weeks = parseWorkoutPaste([
      L('Week 1 - 19/09/2022'),
      L('Monday'),
      L('Squat', '100', '3', '5'),
    ].join('\n'))
    expect(weeks[0].label).toBe('Week 1')
    expect(weeks[0].date).toBe('2022-09-19')
  })

  it('starts a new week on a repeated weekday', () => {
    const weeks = parseWorkoutPaste([
      L('Monday'),
      L('Squat', '100', '3', '5'),
      L('Tuesday'),
      L('Bench Press', '60', '5', '5'),
      L('Monday'),
      L('Squat', '102.5', '3', '5'),
    ].join('\n'))
    expect(weeks).toHaveLength(2)
    expect(weeks[0].days).toHaveLength(2)
    expect(weeks[1].days).toHaveLength(1)
    expect(weeks[1].days[0].exercises[0].loadKg).toBe(102.5)
  })

  it('starts a new week on each date line (batch paste)', () => {
    const weeks = parseWorkoutPaste([
      L('03/11/2025'),
      L('Monday'),
      L('Squat', '100', '3', '5'),
      L('10/11/2025'),
      L('Monday'),
      L('Squat', '102.5', '3', '5'),
    ].join('\n'))
    expect(weeks).toHaveLength(2)
    expect(weeks[0].date).toBe('2025-11-03')
    expect(weeks[1].date).toBe('2025-11-10')
  })

  it('handles CRLF input', () => {
    const weeks = parseWorkoutPaste('Monday\r\n' + L('Squat', '100', '3', '5') + '\r\n')
    expect(weeks[0].days[0].exercises[0].name).toBe('Squat')
  })

  it('falls back to 2+ space separation when there are no tabs', () => {
    const weeks = parseWorkoutPaste('Monday\nBench Press  60  5  5  Felt strong')
    const ex = weeks[0].days[0].exercises[0]
    expect(ex.name).toBe('Bench Press')
    expect(ex.loadKg).toBe(60)
    expect(ex.sets).toBe(5)
    expect(ex.reps).toBe(5)
    expect(ex.remarks).toEqual(['Felt strong'])
  })

  it('returns [] for empty or whitespace input', () => {
    expect(parseWorkoutPaste('')).toEqual([])
    expect(parseWorkoutPaste('\n\n  \n')).toEqual([])
  })

  it('puts loose exercises before any day header into an unnamed day', () => {
    const weeks = parseWorkoutPaste(L('Squat', '100', '3', '5'))
    expect(weeks).toHaveLength(1)
    expect(weeks[0].days).toHaveLength(1)
    expect(weeks[0].days[0].exercises[0].name).toBe('Squat')
  })
})
