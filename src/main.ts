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
  const workoutAnalysisContainer = document.querySelector('#workout-analysis-container') as HTMLDivElement;
  const gymDaysDropdown = document.querySelector('#gym-days') as HTMLSelectElement;
  const workoutLogContainer = document.querySelector('#workout-log-container') as HTMLDivElement;

  if (workoutAnalysisContainer) {
    workoutAnalysisContainer.addEventListener('click', handleAnalysisClicks);
  }

  if (gymDaysDropdown) {
    gymDaysDropdown.addEventListener('change', handleWorkoutSelection);
  }

  if (workoutLogContainer) {
    workoutLogContainer.addEventListener('input', handleWorkoutInput);
    workoutLogContainer.addEventListener('click', handleWorkoutClicks);
  }
}

// EVENT DELEGATORS

function handleAnalysisClicks(event: Event) {
  const target = event.target as HTMLButtonElement;

  if (target.closest('#global-analysis-btn')) initiateGlobalAnalysis(target);
  if (target.closest('#live-analysis-btn')) initiateLiveAnalysis(target);
}

function handleWorkoutSelection(event: Event) {
  const selectedValue = (event.target as HTMLSelectElement).value;
  const workoutId = parseInt(selectedValue.replace('day-', ''));
  const targetWorkout = workoutDB.find((w) => w.workout_id === workoutId);

  if (targetWorkout) {
    renderWorkoutLogForm(targetWorkout);
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

  const delExerciseBtn = target.closest('.delete-exercise-btn') as HTMLButtonElement | null;
  if (delExerciseBtn) return removeExerciseFromSession(delExerciseBtn);

  const addExerciseBtn = target.closest('#add-exercise-btn') as HTMLButtonElement | null;
  if (addExerciseBtn) return toggleAddExerciseDropdown(addExerciseBtn);

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

function initiateGlobalAnalysis(btn: HTMLButtonElement) {
  if (workoutDB.length === 0) {
    return showInlineWarning(btn, 'No Workouts Found');
  }

  const analysisContainer = document.querySelector('#workout-analysis-container');
  if (!analysisContainer) return;

  analysisContainer.classList = 'flex flex-col items-center w-full';
  analysisContainer.innerHTML = renderDashboardResults(catchDashboardAnalysis());

  document.querySelector('#analysis-back-btn')?.addEventListener('click', () => {
    analysisContainer.classList = 'flex flex-row justify-center gap-[7.5%] p-4';
    analysisContainer.innerHTML = returnToAnalysisMenu();
  });

  setupDashboardFilters(analysisContainer as HTMLDivElement);
}

function setupDashboardFilters(container: HTMLDivElement) {
  let activeMuscle: MuscleGroup | undefined = undefined;
  let badOnly: boolean = false;

  const setupToggleListeners = () => {
    container.querySelectorAll('.muscle-group-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.closest('.flex.flex-col') as HTMLElement;
        const cards = section.querySelector('.muscle-group-cards') as HTMLElement;
        const icon = header.querySelector('svg') as SVGElement;

        cards.classList.toggle('hidden');
        icon.classList.toggle('rotate-180');
        icon.classList.toggle('rotate-0');
      });
    });
  };

  const rerender = () => {
    let results = catchDashboardAnalysis(activeMuscle);

    if (badOnly) {
      results = results.filter((e) => e.type === 'insufficient' || e.data.status === 'bad');
    }

    const resultsContainer = container.querySelector('#dashboard-results') as HTMLElement;
    if (resultsContainer) resultsContainer.innerHTML = renderDashboardCards(results);
    setupToggleListeners();
  };

  container.querySelector('#muscle-filter')?.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value;
    activeMuscle = val ? (val as MuscleGroup) : undefined;
    rerender();
  });

  const toggleBtn = container.querySelector('#bad-only-toggle') as HTMLButtonElement;
  toggleBtn?.addEventListener('click', () => {
    badOnly = !badOnly;
    toggleBtn.classList.toggle('border-red-500', badOnly);
    toggleBtn.classList.toggle('text-red-500', badOnly);
    toggleBtn.classList.toggle('border-border', !badOnly);
    toggleBtn.classList.toggle('text-border', !badOnly);
    rerender();
  });

  setupToggleListeners();
}

function initiateLiveAnalysis(btn: HTMLButtonElement) {
  const hasData = activeWorkoutState.length > 0;

  if (!hasData) {
    return showInlineWarning(btn, 'Select a Workout First!');
  }

  const analysisContainer = document.querySelector('#workout-analysis-container');

  if (analysisContainer) {
    analysisContainer.className = 'flex flex-col items-center w-full';
    analysisContainer.innerHTML = createLiveConfirmationMenu();

    const confirmBtn = document.querySelector('#confirm-live-analysis-btn') as HTMLButtonElement;
    const cancelBtn = document.querySelector('#cancel-live-analysis-btn') as HTMLButtonElement;

    cancelBtn?.addEventListener('click', () => {
      analysisContainer.className = 'flex flex-row justify-center gap-[7.5%] p-4';
      analysisContainer.innerHTML = returnToAnalysisMenu();
    });

    confirmBtn?.addEventListener('click', () => {
      const activeInstances = activeWorkoutState.map((ex) => ({
        instance_id: '',
        session_id: '',
        exercise_id: ex.exercise_id,
        sets: ex.sets,
      }));

      const results = catchLiveAnalysis(activeInstances);

      if (results.length === 0) {
        confirmBtn.classList.add('w-fit');
        showInlineWarning(confirmBtn, 'No Data Available');
        return;
      }

      analysisContainer.innerHTML = renderLiveAnalysisResults(results);

      document.querySelector('#analysis-back-btn')?.addEventListener('click', () => {
        analysisContainer.className = 'flex flex-row justify-center gap-[7.5%] p-4';
        analysisContainer.innerHTML = returnToAnalysisMenu();
      });
    });
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

function removeExerciseFromSession(btn: HTMLButtonElement) {
  const row = btn.closest('.workout-log-entry') as HTMLElement;
  const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);

  if (document.querySelectorAll('.workout-log-entry').length > 1) {
    row.remove();
    activeWorkoutState = activeWorkoutState.filter((ex) => ex.exercise_id !== exerciseId);
  } else {
    showTooltipWarning(btn, 'Need 1 Exercise!');
  }
}

function addNewExercise(name: string, muscle: MuscleGroup, workoutId: number, minReps: number, maxReps: number): Exercise {
  const normalisedName = name.trim();

  const existing = exerciseDB.find((e) => e.name.toLowerCase() === normalisedName.toLowerCase());
  if (existing) return existing;

  const newExercise: Exercise = {
    exercise_id: globalExerciseIdCounter++,
    name: normalisedName,
    muscle,
  };

  exerciseDB.push(newExercise);

  const workout = workoutDB.find((w) => w.workout_id === workoutId);
  workout?.exercises.push({
    exercise_id: newExercise.exercise_id,
    set_num: 3,
    reps: { min_reps: minReps, max_reps: maxReps },
  });

  saveWorkoutData().catch((e) => console.error('Save after new exercise failed', e));
  return newExercise;
}

function addExerciseToSession(exercise: Exercise, workoutId: number) {
  const workoutExercise = workoutDB.flatMap((w) => w.exercises).find((e) => e.exercise_id === exercise.exercise_id);

  const setNum = workoutExercise?.set_num ?? 3;
  const minReps = workoutExercise?.reps.min_reps ?? 8;
  const maxReps = workoutExercise?.reps.max_reps ?? 12;

  activeWorkoutState.push({
    exercise_id: exercise.exercise_id,
    sets: Array.from({ length: setNum }, (_, i) => ({ num: i + 1, reps: 0, weight: 0 })),
  });

  const workoutLogContainer = document.querySelector('#workout-log-container') as HTMLDivElement;
  const rowElement = createExerciseRow({
    ...exercise,
    set_num: setNum,
    reps: { min_reps: minReps, max_reps: maxReps },
  });

  const addExerciseRow = workoutLogContainer.querySelector('#add-exercise-btn')?.closest('div');

  if (addExerciseRow) {
    workoutLogContainer.insertBefore(rowElement, addExerciseRow);
  } else {
    workoutLogContainer.appendChild(rowElement);
  }
}

function toggleAddExerciseDropdown(btn: HTMLButtonElement) {
  const existingDropdown = document.querySelector('#add-exercise-dropdown');

  if (existingDropdown) {
    existingDropdown.remove();
    return;
  }

  const currentWorkoutId = parseInt((document.querySelector('#gym-days') as HTMLSelectElement).value.replace('day-', ''));
  const currentMuscles = workoutDB.find((w) => w.workout_id === currentWorkoutId)?.exercises.map((e) => exerciseDB.find((ex) => ex.exercise_id === e.exercise_id)?.muscle) ?? [];
  const loggedIds = activeWorkoutState.map((e) => e.exercise_id);

  const available = exerciseDB
    .filter((e) => !e.is_deleted && !loggedIds.includes(e.exercise_id))
    .sort((a, b) => {
      const aRelevant = currentMuscles.includes(a.muscle) ? 0 : 1;
      const bRelevant = currentMuscles.includes(b.muscle) ? 0 : 1;
      return aRelevant - bRelevant;
    });

  const dropdown = document.createElement('div');
  dropdown.id = 'add-exercise-dropdown';
  dropdown.className = 'flex flex-col w-full bg-surface border border-border mb-2 rounded-lg overflow-hidden';

  dropdown.innerHTML = `
    <input 
      id="exercise-search-input"
      type="text" 
      placeholder="Search Exercises..." 
      class="w-full bg-transparent border-b border-border text-white max-[550px]:text-sm max-[440px]:text-xs px-3 py-2 focus:outline-none focus:border-accent"
    />
    <ul id="exercise-option-list" class="flex flex-col max-h-24 max-[550px]:max-h-16 overflow-y-scroll [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-neutral-600">
      ${available
        .map(
          (e) => `
        <li 
          class="exercise-option px-3 py-2 text-sm max-[550px]:text-xs max-[440px]:text-[10px] text-${'color-' + e.muscle} cursor-pointer hover:bg-border transition-colors duration-150"
          data-exercise-id="${e.exercise_id}"
        >
          ${e.name}
        </li>
      `,
        )
        .join('')}
      <li id="add-new-exercise-option" class="px-3 py-2 text-sm max-[550px]:text-xs max-[440px]:text-[10px] text-muted cursor-pointer hover:bg-border transition-colors duration-150 border-t border-border">
        + Add New Exercise
      </li>
    </ul>
  `;

  btn.insertAdjacentElement('afterend', dropdown);

  dropdown.querySelector('#exercise-search-input')?.addEventListener('input', (e) => {
    const query = (e.target as HTMLInputElement).value.toLowerCase().trim();
    const options = dropdown.querySelectorAll('.exercise-option') as NodeListOf<HTMLElement>;
    options.forEach((opt) => {
      opt.style.display = opt.textContent?.toLowerCase().includes(query) ? '' : 'none';
    });
  });

  dropdown.querySelectorAll('.exercise-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      const id = parseInt((opt as HTMLElement).dataset.exerciseId || '0');
      const exercise = exerciseDB.find((e) => e.exercise_id === id);
      if (exercise) addExerciseToSession(exercise, currentWorkoutId);
      dropdown.remove();
    });
  });

  dropdown.querySelector('#add-new-exercise-option')?.addEventListener('click', () => {
    dropdown.remove();
    openNewExerciseForm(btn, currentWorkoutId);
  });
}

function openNewExerciseForm(btn: HTMLButtonElement, workoutId: number) {
  const form = document.createElement('div');
  form.id = 'new-exercise-form';
  form.className = 'flex flex-col gap-2 w-full bg-surface border border-border rounded-lg p-3 mb-2';

  form.innerHTML = `
    <input id="new-ex-name" type="text" placeholder="Exercise name" class="w-full bg-transparent border border-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
    <select id="new-ex-muscle" class="w-full bg-surface border border-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent">
      ${(['chest', 'biceps', 'back', 'triceps', 'legs', 'abs', 'shoulders', 'forearms'] as MuscleGroup[])
        .map((m) => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`)
        .join('')}
    </select>
    <div class="flex gap-2">
      <input id="new-ex-min" type="number" placeholder="Min reps" min="1" class="w-full bg-transparent border border-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
      <input id="new-ex-max" type="number" placeholder="Max reps" min="1" class="w-full bg-transparent border border-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent" />
    </div>
    <div class="flex gap-2">
      <button id="new-ex-cancel" class="w-full border border-border text-border text-sm rounded-lg py-2 transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">Cancel</button>
      <button id="new-ex-confirm" class="w-full border border-accent text-accent text-sm rounded-lg py-2 transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">Add</button>
    </div>
  `;

  btn.insertAdjacentElement('afterend', form);

  form.querySelector('#new-ex-cancel')?.addEventListener('click', () => form.remove());

  form.querySelector('#new-ex-confirm')?.addEventListener('click', () => {
    const name = (form.querySelector('#new-ex-name') as HTMLInputElement).value.trim();
    const muscle = (form.querySelector('#new-ex-muscle') as HTMLSelectElement).value as MuscleGroup;
    const minReps = parseInt((form.querySelector('#new-ex-min') as HTMLInputElement).value) || 8;
    const maxReps = parseInt((form.querySelector('#new-ex-max') as HTMLInputElement).value) || 12;

    if (!name) return showInlineWarning(form.querySelector('#new-ex-confirm') as HTMLButtonElement, 'Name required');

    const newExercise = addNewExercise(name, muscle, workoutId, minReps, maxReps);
    addExerciseToSession(newExercise, workoutId);
    form.remove();
  });
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

function triggerImport(btn: HTMLButtonElement) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    setButtonLoadingState(btn, 'Importing...');

    try {
      await importWorkoutData(file);
      setButtonSuccessState(btn, 'Imported!', 'Import Data');
    } catch (err: any) {
      btn.disabled = false;
      showInlineWarning(btn, err.message || 'Import Failed');
    }
  });

  input.click();
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
  prev_perf: [number, number];
  curr_perf: [number, number];
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

function analysePerformance(exerciseId: number): AnalysisReport | null {
  try {
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

    let min: number = 0;
    let max: number = 0;

    if (repRange) {
      [min, max] = repRange as [number, number];
    } else {
      throw new Error('Invalid Exercise ID or missing rep range.');
    }

    if (newPerformance[1] < min) reportCode = -1;
    else if (newPerformance[1] > max) reportCode = 1;
    else reportCode = 0;

    return {
      exercise_id: exerciseId,
      status: statusCode,
      report_code: reportCode,
      prev_perf: oldPerformance,
      curr_perf: newPerformance,
    };
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`Analysis skipped for Exercise ${exerciseId}: ${error.message}`);
    } else {
      console.error('An unknown error occurred during analysis.', error);
    }

    return null;
  }
}

// IMPLEMENTING ANALYSIS

type DashboardEntry = { type: 'report'; data: AnalysisReport; exercise: Exercise } | { type: 'insufficient'; exercise: Exercise };

function catchDashboardAnalysis(filterMuscle?: MuscleGroup, filterWorkoutId?: number): DashboardEntry[] {
  let exercises = exerciseDB.filter((e) => !e.is_deleted);

  if (filterMuscle) {
    exercises = exercises.filter((e) => e.muscle === filterMuscle);
  }

  if (filterWorkoutId) {
    const workout = workoutDB.find((w) => w.workout_id === filterWorkoutId);
    const ids = workout?.exercises.map((e) => e.exercise_id) ?? [];
    exercises = exercises.filter((e) => ids.includes(e.exercise_id));
  }

  return exercises.map((exercise) => {
    const analysis = analysePerformance(exercise.exercise_id);
    if (analysis) return { type: 'report', data: analysis, exercise };
    return { type: 'insufficient', exercise };
  });
}

function catchLiveAnalysis(activeInstances: ExerciseInstance[]): AnalysisReport[] {
  const liveAnalysis: AnalysisReport[] = [];

  activeInstances.forEach((instance) => {
    const analysis = analysePerformance(instance.exercise_id);
    if (analysis) liveAnalysis.push(analysis);
  });

  return liveAnalysis;
}

// COMPONENT GENERATORS

function returnToAnalysisMenu(): string {
  return `
    <button
      id="live-analysis-btn"
      class="w-56 max-[600px]:w-32 border border-border rounded-lg text-xl max-[600px]:text-lg max-[440px]:text-base font-bold text-text p-4 cursor-pointer hover:scale-105 transition-all duration-200 ease-in-out hover:border-white hover:text-white"
    >
      By Live Workout
    </button>
    <button
      id="global-analysis-btn"
      class="w-56 max-[600px]:w-32 border border-border rounded-lg text-xl max-[600px]:text-lg max-[440px]:text-base font-bold text-text p-4 cursor-pointer hover:scale-105 transition-all duration-200 ease-in-out hover:border-white hover:text-white"
    >
      By Global Workout
    </button>
  `;
}

function renderDashboardResults(results: DashboardEntry[]): string {
  const backButton = `
    <button id="analysis-back-btn" class="w-fit relative -top-12.5 max-[550px]:top-0 flex justify-center items-center px-3 py-1 mb-2 max-[440px]:px-2 max-[440px]:py-0.5 border border-border rounded-full text-border font-bold text-sm max-[550px]:text-xs max-[440px]:text-[10px] transition-colors duration-200 ease-in-out cursor-pointer hover:border-white hover:text-white">
      <svg class="fill-current size-4 max-[550px]:size-3 mr-0.5" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
      </svg>
      Back
    </button>
  `;

  const filters = `
    <div class="flex flex-row gap-3 w-full mb-4">
      <div class="relative flex-1">
        <select id="muscle-filter" class="block w-full bg-surface border border-border text-white text-sm rounded-lg focus:ring-accent focus:border-accent p-2.5 appearance-none cursor-pointer">
          <option value="">All Muscles</option>
          ${(['chest', 'biceps', 'back', 'triceps', 'legs', 'abs', 'shoulders', 'forearms'] as MuscleGroup[])
            .map((m) => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`)
            .join('')}
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
          <svg class="fill-current h-4 w-4" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
      <button id="bad-only-toggle" class="flex-1 flex justify-center items-center px-3 py-2.5 bg-surface border border-border rounded-lg text-border font-bold text-sm max-[550px]:text-xs transition-colors duration-200 ease-in-out cursor-pointer">
        Needs Work Only
      </button>
    </div>
  `;

  return `
    <div class="flex flex-col w-full mt-3 max-[550px]:mt-0">
      ${backButton}
      ${filters}
      <div id="dashboard-results">${renderDashboardCards(results)}</div>
    </div>
  `;
}

function renderDashboardCards(results: DashboardEntry[]): string {
  if (results.length === 0) {
    return `<p class="text-muted text-sm text-center">No exercises found.</p>`;
  }

  const grouped = results.reduce(
    (acc, entry) => {
      const muscle = entry.exercise.muscle;
      if (!acc[muscle]) acc[muscle] = [];
      acc[muscle].push(entry);
      return acc;
    },
    {} as Record<MuscleGroup, DashboardEntry[]>,
  );

  return (Object.keys(grouped) as MuscleGroup[])
    .map((muscle) => {
      const cards = grouped[muscle]
        .map((entry) => {
          if (entry.type === 'insufficient') {
            return `
              <div class="flex flex-col justify-center gap-1.5 p-3 sm:px-4 sm:py-3 bg-surface border border-border rounded-xl">
                <p class="font-bold text-sm max-[440px]:text-xs uppercase tracking-wider text-${muscle}">${entry.exercise.name}</p>
                <div class="w-full border-t border-border pt-1.5 mt-1.5">
                  <p class="text-xs max-[440px]:text-[10px] text-muted font-medium italic text-center">Not Enough Data to Analyse</p>
                </div>
              </div>
            `;
          }

          const report = entry.data;

          const scoreDiff = report.curr_perf[0] - report.prev_perf[0];
          const scorePct = report.prev_perf[0] !== 0 ? ((scoreDiff / report.prev_perf[0]) * 100).toFixed(1) : '0.0';

          const repsDiff = report.curr_perf[1] - report.prev_perf[1];
          const repsPct = report.prev_perf[1] !== 0 ? ((repsDiff / report.prev_perf[1]) * 100).toFixed(1) : '0.0';

          const pctColour = report.status === 'good' ? 'text-green-500' : 'text-red-500';
          const pctPrefix = scoreDiff >= 0 ? '+' : '';

          const getRecommendation = (report_code: number, status: string): string => {
            if (report_code === -1) return 'Decrease Weight';
            if (report_code === 1) return 'Increase Weight';
            if (report_code === 0 && status === 'good') return 'Stable';
            return 'Maintain Weight, Push for Reps';
          };

          return `
            <div class="flex flex-col gap-1.5 p-3 sm:px-4 sm:py-3 bg-surface border border-border rounded-xl">
              <div class="flex flex-row justify-between items-center">
                <p class="font-bold text-sm max-[440px]:text-xs uppercase tracking-wider text-${muscle}">${entry.exercise.name}</p>
                <p class="text-xs max-[440px]:text-[10px] font-bold ${pctColour}">${pctPrefix}${scorePct}%</p>
              </div>
              <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs max-[440px]:text-[10px] border-t border-border pt-1.5 mt-1.5">
                <div class="flex flex-col">
                  <p class="text-muted uppercase tracking-wider font-semibold">Score</p>
                  <p class="text-white">${report.prev_perf[0].toFixed(1)} → ${report.curr_perf[0].toFixed(1)}</p>
                </div>
                <div class="flex flex-col">
                  <p class="text-muted uppercase tracking-wider font-semibold">Avg Reps</p>
                  <p class="text-white">${report.prev_perf[1].toFixed(1)} → ${report.curr_perf[1].toFixed(1)} <span class="${pctColour}">(${repsDiff >= 0 ? '+' : ''}${repsPct}%)</span></p>
                </div>
              </div>
              <div class="w-full border-t border-border pt-1.5 mt-1.5">
                <p class="text-xs max-[440px]:text-[10px] text-muted">Recommendation: <span class="text-white font-semibold">${getRecommendation(report.report_code, report.status)}</span></p>
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <div class="flex flex-col gap-3 w-full mb-3">
          <div class="flex flex-row justify-between items-center border-b border-border pb-1 mb-1 cursor-pointer muscle-group-header">
            <p class="text-sm max-[440px]:text-xs font-bold uppercase tracking-wider text-${muscle}">${muscle.charAt(0).toUpperCase() + muscle.slice(1)}</p>
            <button class="muscle-group-toggle w-fit flex justify-center items-center p-1 max-[440px]:p-0.5 border border-border rounded-full text-border transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer rotate-180">
              <svg class="fill-current size-5 max-[550px]:size-4 max-[440px]:size-3 transition-transform duration-200 ease-in-out" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </button>
          </div>
          <div class="muscle-group-cards grid grid-cols-1 sm:grid-cols-2 gap-3 w-full hidden">
            ${cards}
          </div>
        </div>
      `;
    })
    .join('');
}

function createLiveConfirmationMenu(): string {
  return `
    <div id="live-confirmation-container" class="flex flex-col items-center w-full">
      <p class="block text-lg max-[440px]:text-base font-bold text-muted uppercase tracking-wider mb-2">Are you finished logging?</p>
      <p class="font-extralight text-center max-[440px]:text-sm">Ensure all sets and weights are updated before running your live analysis.</p>
      <div class="flex flex-row gap-3 mt-3">
        <button id="cancel-live-analysis-btn" class="w-24 max-[440px]:w-20 flex justify-center items-center px-3 py-1 max-[440px]:px-2 border border-border rounded-full text-border font-bold max-[550px]:text-sm whitespace-nowrap transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">Back</button>
        <button id="confirm-live-analysis-btn" class="w-24 max-[440px]:w-20 flex justify-center items-center px-3 py-1 max-[440px]:px-2 border border-border rounded-full text-border font-bold max-[550px]:text-sm whitespace-nowrap transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">Analyse</button>
      </div>
    </div>
  `;
}

function renderLiveAnalysisResults(results: AnalysisReport[]): string {
  const backButton = `
    <button id="analysis-back-btn" class="w-fit absolute max-[550px]:relative -top-12.5 max-[550px]:top-0 flex justify-center items-center px-3 py-1 mb-2 max-[550px]:mb-0 max-[440px]:px-2 max-[440px]:py-0.5 border border-border rounded-full text-border font-bold text-sm max-[550px]:text-xs max-[440px]:text-[10px] transition-colors duration-200 ease-in-out cursor-pointer hover:border-white hover:text-white">
      <svg class="fill-current size-4 max-[550px]:size-3 mr-0.5" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
      </svg>
      Back
    </button>
  `;

  const cards = results
    .map((report) => {
      const exercise = exerciseDB.find((e) => e.exercise_id === report.exercise_id);
      const muscleColour = exercise ? `text-${exercise.muscle}` : 'text-white';

      const scoreDiff = report.curr_perf[0] - report.prev_perf[0];
      const scorePct = report.prev_perf[0] !== 0 ? ((scoreDiff / report.prev_perf[0]) * 100).toFixed(1) : '0.0';

      const repsDiff = report.curr_perf[1] - report.prev_perf[1];
      const repsPct = report.prev_perf[1] !== 0 ? ((repsDiff / report.prev_perf[1]) * 100).toFixed(1) : '0.0';

      const pctColour = report.status === 'good' ? 'text-green-500' : 'text-red-500';
      const pctPrefix = scoreDiff >= 0 ? '+' : '';

      const getRecommendation = (report_code: number, status: string): string => {
        if (report_code === -1) return 'Decrease Weight';
        if (report_code === 1) return 'Increase Weight';
        if (report_code === 0 && status === 'good') return 'Stable';
        return 'Maintain Weight, Push for Reps';
      };

      return `
        <div class="w-full flex flex-col gap-1 px-4 py-3 bg-surface border border-border rounded-xl">
          <div class="flex flex-row justify-between items-center">
            <p class="font-bold text-sm max-[440px]:text-xs uppercase tracking-wider ${muscleColour}">${exercise?.name ?? 'Unknown Exercise'}</p>
            <p class="text-xs max-[440px]:text-[10px] font-semibold ${pctColour}">${pctPrefix}${scorePct}%</p>
          </div>
          <div class="w-full h-px bg-border my-1"></div>
          <div class="grid grid-cols-2 gap-2 text-xs max-[440px]:text-[10px]">
            <div class="flex flex-col gap-0.5">
              <p class="text-muted uppercase tracking-wider font-semibold">Score</p>
              <p class="text-white">${report.prev_perf[0]} → ${report.curr_perf[0]}</p>
            </div>
            <div class="flex flex-col gap-0.5">
              <p class="text-muted uppercase tracking-wider font-semibold">Avg Reps</p>
              <p class="text-white">${report.prev_perf[1]} → ${report.curr_perf[1]} <span class="${pctColour}">(${repsDiff >= 0 ? '+' : ''}${repsPct}%)</span></p>
            </div>
          </div>
          <div class="w-full h-px bg-border my-1"></div>
          <p class="text-xs max-[440px]:text-[10px] text-muted">Recommendation: <span class="text-white font-semibold">${getRecommendation(report.report_code, report.status)}</span></p>
        </div>
      `;
    })
    .join('');

  return `<div class="relative flex flex-col gap-5 w-full mt-3 max-[550px]:mt-0">${backButton}${cards}</div>`;
}

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
      <button class="delete-exercise-btn w-fit relative transition-colors duration-200 ease-in-out flex justify-center items-center p-1 max-[440px]:p-0.5 border border-border rounded-full text-border cursor-pointer hover:border-white hover:text-white">
        <svg class="fill-current size-5 max-[550px]:size-4 max-[440px]:size-3" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
        </svg>
      </button>
      <p class="max-[550px]:text-sm max-[440px]:text-xs font-medium ${'text-' + exercise.muscle} pr-2">${exercise.name}</p>
    </div>
    <button class="option-dropdown w-fit flex justify-center items-center p-1 max-[440px]:p-0.5 mx-auto max:[440px]:m-0 border border-border rounded-full text-border cursor-pointer rotate-180 transition-colors duration-200 ease-in-out hover:border-white hover:text-white">
      <svg class="fill-current size-5 max-[550px]:size-4 max-[440px]:size-3 transition-transform duration-200 ease-in-out" viewBox="0 0 20 20">
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
      <button class="add-set w-fit relative flex justify-center items-center my-auto px-3 py-1 max-[440px]:px-2 max-[440px]:py-0.5 border border-border rounded-full text-border font-bold text-sm max-[550px]:text-xs max-[440px]:text-[10px] transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">
        Add Set
        <svg class="fill-current size-5 max-[550px]:size-4 ml-0.5" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z" clip-rule="evenodd" />
        </svg>
      </button>
      <button class="del-set w-fit relative flex justify-center items-center my-auto px-3 py-1 max-[440px]:px-2 max-[440px]:py-0.5 border border-border rounded-full text-border font-bold text-sm max-[550px]:text-xs max-[440px]:text-[10px] transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">
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

function createNewExercise(): string {
  return `
    <div class="w-full relative max-[550px]:top-2 mx-auto border-b border-border" style="grid-column: 1 / -1">
      <button id="add-exercise-btn" class="w-fit relative flex justify-center items-center mx-auto mb-2 px-4 py-2 max-[440px]:px-2.5 max-[440px]:py-1 border border-border rounded-full text-border font-bold max-[550px]:text-sm max-[440px]:text-xs transition-colors duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">
        Add Exercise
        <svg class="fill-current size-5 max-[550px]:size-4 ml-0.5" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z" clip-rule="evenodd" />
        </svg>
      </button>
    </div>
  `;
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

function setActionButtons(workoutId: number, container: HTMLDivElement) {
  const actionButtonRow = container.querySelector('#action-button-row') as HTMLDivElement;

  if (actionButtonRow) {
    actionButtonRow.insertAdjacentHTML('beforebegin', createNewExercise());
  }

  const saveButton = `
    <button id="save-workout-btn" class="w-46 max-[620px]:w-33 max-[440px]:w-19 bg-surface border border-accent text-accent font-bold max-[620px]:text-xs max-[440px]:text-[10px] uppercase tracking-wider px-4 max-[440px]:px-2.5 py-2 rounded-xl hover:scale-105 transition-all duration-200 ease-in-out hover:border-white hover:text-white cursor-pointer">Save Workout</button>
  `;

  if (actionButtonRow) {
    actionButtonRow.insertAdjacentHTML('afterbegin', saveButton);
  }

  let activeSessionId: string | null = null;

  document.querySelector('#save-workout-btn')?.addEventListener('click', async (e) => {
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

  document.querySelector('#export-workout-btn')?.addEventListener('click', async (e) => {
    const button = e.target as HTMLButtonElement;
    setButtonLoadingState(button, 'Exporting...');
    await exportWorkoutData();
    setButtonSuccessState(button, 'Exported!', 'Export Data');
  });

  document.querySelector('#import-workout-btn')?.addEventListener('click', (e) => {
    triggerImport(e.target as HTMLButtonElement);
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

// WORKOUT LOG RENDER CONTROLLER

function renderWorkoutLogForm(workout: Workout) {
  const workoutLogContainer = document.querySelector('#workout-log-container') as HTMLDivElement;
  const daySelectionContainer = document.querySelector('#log-selection-container') as HTMLDivElement;
  if (!workoutLogContainer || !daySelectionContainer) return;

  // UI Setup
  daySelectionContainer.classList.add('mb-4');

  const actionButtonRow = workoutLogContainer.querySelector('#action-button-row') as HTMLDivElement;

  if (actionButtonRow) {
    actionButtonRow.insertAdjacentHTML('beforebegin', createLogHeader());
  }

  // Data & State Setup
  const joinedExercises = buildJoinedExercises(workout);
  initActiveState(joinedExercises);

  // Render Exercises
  joinedExercises.forEach((exercise) => {
    const rowElement = createExerciseRow(exercise);
    if (actionButtonRow) {
      actionButtonRow.insertAdjacentElement('beforebegin', rowElement);
    }
  });

  // Attach Buttons & Listeners
  setActionButtons(workout.workout_id, workoutLogContainer);
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

export async function importWorkoutData(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const raw = e.target?.result as string;
        const data = JSON.parse(raw);

        if (!data.sessions || !data.instances || !data.exercises || !data.workouts) {
          throw new Error('Invalid backup file structure.');
        }

        mySessions = data.sessions;
        myExerciseInstances = data.instances;
        exerciseDB = data.exercises;
        workoutDB = data.workouts;

        if (exerciseDB.length > 0) {
          const maxId = Math.max(...exerciseDB.map((e) => e.exercise_id));
          globalExerciseIdCounter = maxId + 1;
        } else {
          globalExerciseIdCounter = 1;
        }

        fullExercisePerformance = {};
        catchExerciseData();

        await saveWorkoutData();
        resolve();
      } catch (err: any) {
        reject(new Error(err.message || 'Failed to parse import file.'));
      }
    };

    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsText(file);
  });
}
