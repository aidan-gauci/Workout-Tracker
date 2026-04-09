import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

// WORKOUT LOG
type MuscleGroup = 'chest' | 'biceps' | 'back' | 'triceps' | 'legs' | 'abs' | 'shoulders' | 'forearms';

type Exercise = {
  exercise_id: number;
  name: string;
  muscle: MuscleGroup;
  is_deleted?: boolean;
};

type Workout = {
  workout_id: number;
  name: string;
  exercises: {
    exercise_id: number;
    set_num: number;
    reps: {
      min_reps: number;
      max_reps: number;
    };
  }[];
};

type WorkoutInstance = {
  session_id: string;
  workout_id: number;
  date: string;
};

type ExerciseInstance = {
  instance_id: string;
  session_id: string;
  exercise_id: number;
  sets: {
    num: number;
    reps: number;
    weight: number;
  }[];
};

type ActiveExerciseState = {
  exercise_id: number;
  sets: { num: number; reps: number; weight: number }[];
};

let activeWorkoutState: ActiveExerciseState[] = [];

let exerciseDB: Exercise[] = [];
let workoutDB: Workout[] = [];
let globalExerciseIdCounter = 1;

function initialiseSchemaFromDOM() {
  workoutDB = [];
  let hasNewExercises = false;

  const articles = document.querySelectorAll('article');

  articles.forEach((article, index) => {
    const workoutName = article.querySelector('h2')?.innerText.trim() || `Workout ${index + 1}`;
    const workoutId = index + 1;

    const exercisesForThisWorkout: Workout['exercises'] = [];

    const listItems = article.querySelectorAll('li');
    listItems.forEach((li) => {
      const nameElement = li.querySelector('.exercise-name') as HTMLElement;
      if (!nameElement) return;

      let muscleGroup: MuscleGroup = 'chest';
      const classes = Array.from(nameElement.classList);
      const muscleClass = classes.find((c) => c.startsWith('text-') && c !== 'text-s' && c !== 'text-sm' && c !== 'text-text');

      if (muscleClass) {
        muscleGroup = muscleClass.replace('text-', '') as MuscleGroup;
      }

      const exerciseName = nameElement.innerText.replace('SS', '').trim();
      const exerciseRangeElement = li.querySelector('.exercise-range') as HTMLElement;
      const [setNumber, repRange] = exerciseRangeElement.innerText.split(' x ') as [string, string];
      const [minReps, maxReps] = repRange.split('-') as [string, string];

      let exerciseObj = exerciseDB.find((e) => e.name === exerciseName);

      if (!exerciseObj) {
        exerciseObj = {
          exercise_id: globalExerciseIdCounter++,
          name: exerciseName,
          muscle: muscleGroup,
        };
        exerciseDB.push(exerciseObj);
        hasNewExercises = true;
      } else {
        exerciseObj.muscle = muscleGroup;
      }

      exercisesForThisWorkout.push({
        exercise_id: exerciseObj.exercise_id,
        set_num: parseInt(setNumber, 10),
        reps: {
          min_reps: parseInt(minReps, 10),
          max_reps: parseInt(maxReps, 10),
        },
      });
    });

    workoutDB.push({
      workout_id: workoutId,
      name: workoutName,
      exercises: exercisesForThisWorkout,
    });
  });

  if (hasNewExercises) {
    saveWorkoutData().catch((e) => console.error('Background dictionary save failed', e));
  }
}

// MAIN SETUP

window.addEventListener('DOMContentLoaded', async () => {
  await loadWorkoutData();
  initialiseSchemaFromDOM();
  catchExerciseData();
  setupGlobalEventListeners();
});

function setupGlobalEventListeners() {
  const gymDaysDropdown = document.getElementById('gym-days') as HTMLSelectElement;
  const workoutLogContainer = document.getElementById('workout-log-container') as HTMLDivElement;

  if (gymDaysDropdown) {
    gymDaysDropdown.addEventListener('change', handleWorkoutSelection);
  }

  if (workoutLogContainer) {
    workoutLogContainer.addEventListener('input', handleWorkoutInput);
    workoutLogContainer.addEventListener('click', handleWorkoutClicks);
  }
}

// EVENT DELEGATORS

function handleWorkoutSelection(event: Event) {
  const selectedValue = (event.target as HTMLSelectElement).value;
  const workoutId = parseInt(selectedValue.replace('day-', ''));
  const targetWorkout = workoutDB.find((w) => w.workout_id === workoutId);

  if (targetWorkout) {
    renderWorkoutForm(targetWorkout);
  }
}

function handleWorkoutInput(event: Event) {
  const target = event.target as HTMLInputElement;
  if (!target.matches('input.exercise-reps, input.exercise-weight')) return;

  const row = target.closest('.workout-log-entry');
  const setEntry = target.closest('.set-entry');
  if (!row || !setEntry) return;

  const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);
  const setNum = parseInt(setEntry.getAttribute('data-set-num') || '0', 10);

  updateActiveStateData(exerciseId, setNum, target);
}

function handleWorkoutClicks(event: Event) {
  const target = event.target as HTMLElement;

  const dropdownBtn = target.closest('.option-dropdown') as HTMLButtonElement | null;
  if (dropdownBtn) return toggleSetDropdown(dropdownBtn);

  const deleteBtn = target.closest('.exercise-delete') as HTMLButtonElement | null;
  if (deleteBtn) return removeExercise(deleteBtn);

  const delSetBtn = target.closest('.del-set') as HTMLButtonElement | null;
  if (delSetBtn) return removeSet(delSetBtn);

  const addSetBtn = target.closest('.add-set') as HTMLButtonElement | null;
  if (addSetBtn) return addSet(addSetBtn);
}

// ACTION HANDLERS

function updateActiveStateData(exerciseId: number, setNum: number, target: HTMLInputElement) {
  const exerciseState = activeWorkoutState.find((ex) => ex.exercise_id === exerciseId);
  if (!exerciseState) return;

  const set = exerciseState.sets.find((s) => s.num === setNum);
  if (!set) return;

  if (target.classList.contains('exercise-reps')) {
    set.reps = parseInt(target.value, 10) || 0;
  } else if (target.classList.contains('exercise-weight')) {
    set.weight = parseFloat(target.value) || 0;
  }
}

function toggleSetDropdown(btn: HTMLButtonElement) {
  const row = btn.closest('.workout-log-entry');
  const dropdownContainer = row?.querySelector('.dropdown-content');
  const dropdownIcon = btn.querySelector('svg');

  if (dropdownContainer && dropdownIcon) {
    dropdownIcon.classList.toggle('rotate-180');
    dropdownIcon.classList.toggle('rotate-0');
    dropdownContainer.classList.toggle('hidden');
  }
}

function removeExercise(btn: HTMLButtonElement) {
  const row = btn.closest('.workout-log-entry') as HTMLElement;
  const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);

  if (document.querySelectorAll('.workout-log-entry').length > 1) {
    row.remove();
    activeWorkoutState = activeWorkoutState.filter((ex) => ex.exercise_id !== exerciseId);
  } else {
    showTooltipWarning(btn, 'Need 1 Exercise!');
  }
}

function removeSet(btn: HTMLButtonElement) {
  const dropdownContainer = btn.closest('.dropdown-content') as HTMLElement;
  const setEntries = dropdownContainer.querySelectorAll('.set-entry');
  const row = dropdownContainer.closest('.workout-log-entry') as HTMLElement;
  const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);

  if (setEntries.length > 1) {
    (setEntries[setEntries.length - 1] as HTMLElement).remove();
    const exState = activeWorkoutState.find((ex) => ex.exercise_id === exerciseId);
    if (exState) exState.sets.pop();
  } else {
    showInlineWarning(btn, 'Min 1 Set');
  }
}

function addSet(btn: HTMLButtonElement) {
  const dropdownContainer = btn.closest('.dropdown-content') as HTMLElement;
  const setEntries = dropdownContainer.querySelectorAll('.set-entry');
  const row = dropdownContainer.closest('.workout-log-entry') as HTMLElement;
  const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);

  if (setEntries.length < 5) {
    const newSetNum = setEntries.length + 1;
    (btn.parentElement as HTMLElement).insertAdjacentHTML('beforebegin', createNewSet(newSetNum));

    const exState = activeWorkoutState.find((ex) => ex.exercise_id === exerciseId);
    if (exState) exState.sets.push({ num: newSetNum, reps: 0, weight: 0 });
  } else {
    showInlineWarning(btn, 'Max 5 Sets');
  }
}

// UI STATE HANDLERS

function showInlineWarning(btn: HTMLButtonElement, warningText: string) {
  if (btn.dataset.warning === 'true') return;
  btn.dataset.warning = 'true';

  const originalHTML = btn.innerHTML;

  btn.classList.replace('border-border', 'border-white');
  btn.classList.replace('text-border', 'text-white');
  btn.classList.replace('cursor-pointer', 'cursor-not-allowed');
  btn.classList.add('bg-red-700');
  btn.innerText = warningText;

  setTimeout(() => {
    btn.classList.replace('border-white', 'border-border');
    btn.classList.replace('text-white', 'text-border');
    btn.classList.replace('cursor-not-allowed', 'cursor-pointer');
    btn.classList.remove('bg-red-700');
    btn.innerHTML = originalHTML;
    btn.dataset.warning = 'false';
  }, 2000);
}

function showTooltipWarning(btn: HTMLButtonElement, warningText: string) {
  if (btn.dataset.warning === 'true') return;
  btn.dataset.warning = 'true';

  btn.classList.replace('border-border', 'border-white');
  btn.classList.replace('text-border', 'text-white');
  btn.classList.replace('cursor-pointer', 'cursor-not-allowed');
  btn.classList.add('bg-red-700');

  const popup = document.createElement('span');
  popup.className = 'w-fit absolute top-full mt-2 px-2 py-1 opacity-0 transition-opacity duration-200 ease-in-out bg-red-700 text-[10px] text-white border border-white rounded-full whitespace-nowrap';
  popup.innerText = warningText;
  btn.appendChild(popup);

  setTimeout(() => {
    popup.classList.replace('opacity-0', 'opacity-100');
  }, 10);

  setTimeout(() => {
    btn.classList.replace('border-white', 'border-border');
    btn.classList.replace('text-white', 'text-border');
    btn.classList.replace('cursor-not-allowed', 'cursor-pointer');
    btn.classList.remove('bg-red-700');
    popup.classList.replace('opacity-100', 'opacity-0');

    setTimeout(() => {
      btn.removeChild(popup);
      btn.dataset.warning = 'false';
    }, 200);
  }, 2000);
}

// DATA PREPARATION

function buildJoinedExercises(workout: Workout) {
  return workout.exercises
    .map((prescription) => {
      const details = exerciseDB.find((e) => e.exercise_id === prescription.exercise_id);
      return { ...details, ...prescription };
    })
    .filter((e) => e.name !== undefined);
}

function initActiveState(joinedExercises: any[]) {
  activeWorkoutState = joinedExercises.map((exercise) => {
    const totalSets = exercise.set_num || 3;
    const initialSets = [];
    for (let i = 1; i <= totalSets; i++) {
      initialSets.push({ num: i, reps: 0, weight: 0 });
    }
    return {
      exercise_id: exercise.exercise_id,
      sets: initialSets,
    };
  });
}

// COMPONENT GENERATORS

function createLogHeader(): string {
  return `
    <div class="text-lg max-[440px]:text-base font-bold grid grid-cols-[1fr_7.5%_12.5%_12.5%] gap-3 items-center pb-4 border-b border-border" style="grid-template-columns: 1fr 12.5% 12.5%">
      <p class="text-white tracking-wider uppercase">Exercise</p>
      <p class="text-accent text-center">Reps</p>
      <p class="text-accent text-center">Kg</p>
    </div>
  `;
}

function createExerciseRow(exercise: any): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'workout-log-entry grid gap-3 items-center align-middle';
  row.style.gridTemplateColumns = '1fr 5% 12.5% 12.5%';
  row.dataset.exerciseId = exercise.exercise_id.toString();

  row.innerHTML = `
    <div class="flex flex-row gap-4 ml-2 max-[440px]:gap-2 max-[440px]:ml-1 items-center">
      <button class="exercise-delete w-fit relative transition-colors duration-200 ease-in-out flex justify-center items-center p-1 max-[440px]:p-0.5 border border-border rounded-full text-border cursor-pointer">
        <svg class="fill-current size-5 max-[550px]:size-4 max-[440px]:size-3" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
        </svg>
      </button>
      <p class="max-[550px]:text-sm max-[440px]:text-xs font-medium ${'text-' + exercise.muscle} pr-2">${exercise.name}</p>
    </div>
    <button class="option-dropdown w-fit flex justify-center items-center p-1 max-[440px]:p-0.5 mx-auto max:[440px]:m-0 border border-border rounded-full text-border cursor-pointer rotate-0">
      <svg class="fill-current size-5 max-[550px]:size-4 max-[440px]:size-3" viewBox="0 0 20 20">
        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
      </svg>
    </button>
    <p class="exercise-reps w-full bg-transparent border border-border text-white rounded-lg text-center py-2.5 max-[550px]:py-1.5 max-[550px]:text-xs max-[440px]:py-1 max-[440px]:text-[10px] focus:ring-accent focus:border-accent appearance-none m-0 min-w-0">
      ${exercise.reps.min_reps}-${exercise.reps.max_reps}
    </p>
    <p class="exercise-weight w-full bg-transparent border border-border text-white rounded-lg text-center py-2.5 max-[550px]:py-1.5 max-[550px]:text-xs max-[440px]:py-1 max-[440px]:text-[10px] focus:ring-accent focus:border-accent appearance-none m-0 min-w-0">
      0.0 
    </p>
    `;

  const dropdownContainer = document.createElement('div');
  dropdownContainer.className = 'dropdown-content w-full hidden flex flex-col gap-2 bg-surface border-b border-t border-border pt-2';
  dropdownContainer.style.gridColumn = '1 / -1';

  let setsHTML = '';
  const totalSets = exercise.set_num || 3;
  for (let i = 1; i <= totalSets; i++) {
    setsHTML += createNewSet(i);
  }

  const editSets = `
    <div class="w-full relative -top-2 max-[550px]:-top-1 max-[550px]:mb-1 mx-auto flex flex-row justify-center gap-2" style="grid-column: 1 / -1">
      <button class="add-set w-fit relative flex justify-center items-center my-auto px-3 py-1 max-[440px]:px-2 max-[440px]:py-0.5 border border-border rounded-full text-border font-bold text-sm max-[550px]:text-xs max-[440px]:text-[10px] transition-colors duration-200 ease-in-out cursor-pointer">
        Add Set
        <svg class="fill-current size-5 max-[550px]:size-4 ml-0.5" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z" clip-rule="evenodd" />
        </svg>
      </button>
      <button class="del-set w-fit relative flex justify-center items-center my-auto px-3 py-1 max-[440px]:px-2 max-[440px]:py-0.5 border border-border rounded-full text-border font-bold text-sm max-[550px]:text-xs max-[440px]:text-[10px] transition-colors duration-200 ease-in-out cursor-pointer">
        Del Set
        <svg class="fill-current size-4 ml-0.5 p-0.5" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  `;

  dropdownContainer.innerHTML = setsHTML + editSets;
  row.appendChild(dropdownContainer);

  return row;
}

function createNewSet(i: number) {
  return `
    <div class="set-entry grid gap-3 items-center" style="grid-template-columns: 1fr 12.5% 12.5%" data-set-num="${i}">
      <p class="exercise-set max-[440px]:text-[10px]">Set ${i}:</p>
      <input
        type="number"
        class="exercise-reps w-full bg-transparent border border-border text-white rounded-lg text-center py-2.5 max-[550px]:py-1.5 max-[440px]:py-1 max-[440px]:text-[10px] focus:ring-accent focus:border-accent appearance-none m-0 min-w-0"
        placeholder="0"
        min="0"
      />
      <input
        type="number"
        class="exercise-weight w-full bg-transparent border border-border text-white rounded-lg text-center py-2.5 max-[550px]:py-1.5 max-[440px]:py-1 max-[440px]:text-[10px] focus:ring-accent focus:border-accent appearance-none m-0 min-w-0"
        placeholder="0.0"
        min="0"
        step="0.25"
      />
    </div>
  `;
}

// EVENT AND ACTION HANDLERS

function setupActionButtons(workoutId: number, container: HTMLDivElement) {
  const saveButtonRow = document.createElement('div');
  saveButtonRow.className = 'mt-5 flex flex-row justify-center gap-3';
  saveButtonRow.innerHTML = `
    <button id="save-workout-btn" class="bg-surface border border-accent text-accent font-bold uppercase tracking-wider px-4 py-2 rounded-xl hover:scale-105 transition-transform duration-200 ease-in-out cursor-pointer">Save Workout</button>
    <button id="export-workout-btn" class="bg-surface border border-accent text-accent font-bold uppercase tracking-wider px-4 py-2 rounded-xl hover:scale-105 transition-transform duration-200 ease-in-out cursor-pointer">Export Data</button>
  `;
  container.appendChild(saveButtonRow);

  let activeSessionId: string | null = null;

  document.getElementById('save-workout-btn')?.addEventListener('click', async (e) => {
    const button = e.target as HTMLButtonElement;
    setButtonLoadingState(button, 'Saving...');

    if (!activeSessionId) {
      activeSessionId = `${new Date().toISOString().split('T')[0]}-${Date.now()}`;
      mySessions.push({ session_id: activeSessionId, workout_id: workoutId, date: new Date().toISOString() });
    }

    myExerciseInstances = myExerciseInstances.filter((i) => i.session_id !== activeSessionId);

    let instanceIdCounter = 1;
    activeWorkoutState.forEach((exerciseState) => {
      const validSets = exerciseState.sets.filter((set) => set.reps > 0);
      if (validSets.length > 0) {
        myExerciseInstances.push({
          instance_id: `${activeSessionId}-${instanceIdCounter++}`,
          session_id: activeSessionId as string,
          exercise_id: exerciseState.exercise_id,
          sets: validSets,
        });
      }
    });

    await saveWorkoutData();
    setButtonSuccessState(button, 'Saved!', 'Save Workout');
  });

  document.getElementById('export-workout-btn')?.addEventListener('click', async (e) => {
    const button = e.target as HTMLButtonElement;
    setButtonLoadingState(button, 'Exporting...');
    await exportWorkoutData();
    setButtonSuccessState(button, 'Exported!', 'Export Data');
  });
}

function setButtonLoadingState(btn: HTMLButtonElement, text: string) {
  btn.disabled = true;
  btn.innerText = text;
}

function setButtonSuccessState(btn: HTMLButtonElement, successText: string, defaultText: string) {
  btn.innerText = successText;
  btn.classList.replace('text-accent', 'text-green-500');
  btn.classList.replace('border-accent', 'border-green-500');
  setTimeout(() => {
    btn.disabled = false;
    btn.innerText = defaultText;
    btn.classList.replace('text-green-500', 'text-accent');
    btn.classList.replace('border-green-500', 'border-accent');
  }, 2000);
}

// MAIN RENDER CONTROLLER

function renderWorkoutForm(workout: Workout) {
  const workoutLogContainer = document.getElementById('workout-log-container') as HTMLDivElement;
  const daySelectionContainer = document.getElementById('log-selection-container') as HTMLDivElement;
  if (!workoutLogContainer || !daySelectionContainer) return;

  // UI Setup
  daySelectionContainer.classList.add('border-b', 'border-border', 'pb-4', 'mb-4');
  workoutLogContainer.innerHTML = createLogHeader();

  // Data & State Setup
  const joinedExercises = buildJoinedExercises(workout);
  initActiveState(joinedExercises);

  // Render Exercises
  joinedExercises.forEach((exercise) => {
    const rowElement = createExerciseRow(exercise);
    workoutLogContainer.appendChild(rowElement);
  });

  // Attach Buttons & Listeners
  setupActionButtons(workout.workout_id, workoutLogContainer);
}

// WORKOUT ANALYSIS

interface PerformanceEntry extends ExerciseInstance {
  date: number;
}

type PerformanceDictionary = Record<number, PerformanceEntry[]>;

function getPastPerformance(exerciseId: number): PerformanceEntry[] {
  const instances = myExerciseInstances.filter((inst) => inst.exercise_id === exerciseId);

  const instancesWithDates = instances.map((inst) => {
    const session = mySessions.find((s) => s.session_id === inst.session_id);
    return {
      ...inst,
      date: session ? new Date(session.date).getTime() : 0,
    };
  });

  instancesWithDates.sort((a, b) => b.date - a.date);

  let result = instancesWithDates.slice(0, 2);

  if (result.length === 0) {
    result.push({
      instance_id: 'placeholder',
      session_id: 'none',
      exercise_id: exerciseId,
      date: 0,
      sets: [{ num: 1, reps: 0, weight: 0 }],
    } as PerformanceEntry);
  }

  return result;
}

let fullExercisePerformance: PerformanceDictionary = {};

function catchExerciseData() {
  fullExercisePerformance = {};

  for (let i = 1; i < globalExerciseIdCounter; i++) {
    fullExercisePerformance[i] = getPastPerformance(i);
  }
}

function getRepRange(exerciseId: number) {
  for (const workout of workoutDB) {
    const exerciseMatch = workout.exercises.find((ex) => ex.exercise_id === exerciseId);

    if (exerciseMatch) {
      return [exerciseMatch.reps.min_reps, exerciseMatch.reps.max_reps];
    }
  }

  return null;
}

type AnalysisReport = {
  exercise_id: number;
  status: 'good' | 'bad';
  report_code: -1 | 0 | 1;
};

function computePerformance(entry: PerformanceEntry): [number, number] {
  let totalScore = 0;
  let totalReps = 0;

  entry.sets.forEach((set) => {
    if (set.weight > 0) {
      totalScore += set.weight * (1 + set.reps / 30);
      totalReps += set.reps;
    } else {
      totalScore += set.reps;
      totalReps += set.reps;
    }
  });

  const averageScore = Math.round((totalScore * 10) / entry.sets.length) / 10;
  const averageReps = Math.round((totalReps * 10) / entry.sets.length) / 10;
  return [averageScore, averageReps];
}

function analysePerformance(exerciseId: number): AnalysisReport {
  if (Object.keys(fullExercisePerformance).length === 0) catchExerciseData();

  let performance = fullExercisePerformance[exerciseId];

  if (!performance || performance.length < 2 || performance[0]?.session_id === 'none') {
    throw new Error('Not enough data for this exercise.');
  }

  console.log(performance);

  let statusCode: 'good' | 'bad' = 'bad';
  let reportCode: -1 | 0 | 1 = 0;

  let newPerformance = computePerformance(performance[0] as PerformanceEntry);
  let oldPerformance = computePerformance(performance[1] as PerformanceEntry);

  if (newPerformance[0] > oldPerformance[0]) statusCode = 'good';
  else statusCode = 'bad';

  const repRange = getRepRange(exerciseId);

  let min: number = 0,
    max: number = 0;

  if (repRange) {
    [min, max] = repRange as [number, number];
  } else throw new Error('Invalid Exercise ID.');

  if (newPerformance[1] < min) reportCode = -1;
  else if (newPerformance[1] > max) reportCode = 1;
  else reportCode = 0;

  return {
    exercise_id: exerciseId,
    status: statusCode,
    report_code: reportCode,
  };
}

// DATA STORAGE

let mySessions: WorkoutInstance[] = [];
let myExerciseInstances: ExerciseInstance[] = [];

const FILE_NAME = 'workout-data.json';

export async function loadWorkoutData() {
  try {
    const contents = await Filesystem.readFile({
      path: FILE_NAME,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    const data = JSON.parse(contents.data as string);

    mySessions = data.sessions || [];
    myExerciseInstances = data.instances || [];
    exerciseDB = data.exercises || [];
    workoutDB = data.workouts || [];

    if (exerciseDB.length > 0) {
      const maxId = Math.max(...exerciseDB.map((e) => e.exercise_id));
      globalExerciseIdCounter = maxId + 1;
    } else {
      globalExerciseIdCounter = 1;
    }

    console.log('Local load complete. Current sessions:', mySessions.length);
  } catch (err) {
    console.log('No existing save file found. Starting with an empty log.');
    mySessions = [];
    myExerciseInstances = [];
    exerciseDB = [];
    workoutDB = [];
    globalExerciseIdCounter = 1;
  }
}

let isSaving = false;

export async function saveWorkoutData() {
  if (isSaving) return;
  isSaving = true;

  const cleanExerciseDB = exerciseDB.map((ex) => ({
    exercise_id: ex.exercise_id,
    name: ex.name,
    muscle: ex.muscle,
  }));

  const dataToSave = {
    workouts: workoutDB,
    sessions: mySessions,
    instances: myExerciseInstances,
    exercises: cleanExerciseDB,
  };

  try {
    await Filesystem.writeFile({
      path: FILE_NAME,
      data: JSON.stringify(dataToSave, null, 2),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    console.log('Workout securely saved!');
  } catch (err: any) {
    console.error('Error writing file:', err);
    if (err.message.includes('closing')) {
      console.warn('Database busy, save postponed.');
    } else {
      alert(`Failed to save database: ${err.message}`);
    }
  } finally {
    isSaving = false;
  }
}

export async function exportWorkoutData() {
  const exportPayload = {
    workouts: workoutDB,
    sessions: mySessions,
    instances: myExerciseInstances,
    exercises: exerciseDB,
  };

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const dateString = new Date().toISOString().split('T')[0];
  const exportFileName = `WorkoutBackup_${dateString}.json`;
  const FOLDER_NAME = 'WorkoutAppBackups';

  if (Capacitor.getPlatform() === 'web') {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = exportFileName;

    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    console.log('File successfully downloaded to your computer.');
    return;
  }

  try {
    try {
      await Filesystem.mkdir({
        path: FOLDER_NAME,
        directory: Directory.Documents,
        recursive: false,
      });
    } catch (mkdirErr) {
      console.log('Folder already exists, proceeding to save...');
    }

    await Filesystem.writeFile({
      path: `${FOLDER_NAME}/${exportFileName}`,
      data: jsonString,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    alert(`Success! Saved to Documents/${FOLDER_NAME}/${exportFileName}`);
  } catch (err: any) {
    console.error('Error exporting file:', err);
    alert(`Failed to export backup: ${err.message}`);
  }
}
