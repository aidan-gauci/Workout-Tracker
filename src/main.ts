import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// MUSCLE GAP ANALYSIS

// WORKOUT LOG
type Exercise = {
  exercise_id: number;
  name: string;
  muscle: 'chest' | 'biceps' | 'back' | 'triceps' | 'legs' | 'abs' | 'shoulders' | 'forearms';
  set_num: number;
  rep_range: string;
};

type Workout = {
  workout_id: number;
  name: string;
  exercises: Exercise[];
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
    const exercisesForThisWorkout: Exercise[] = [];

    const listItems = article.querySelectorAll('li');
    listItems.forEach((li) => {
      const nameElement = li.querySelector('.exercise-name') as HTMLElement;
      if (!nameElement) return;

      let muscleGroup: Exercise['muscle'] = 'chest';
      const classes = Array.from(nameElement.classList);
      const muscleClass = classes.find((c) => c.startsWith('text-') && c !== 'text-s' && c !== 'text-sm' && c !== 'text-text');
      if (muscleClass) {
        muscleGroup = muscleClass.replace('text-', '') as Exercise['muscle'];
      }

      const exerciseName = nameElement.innerText.replace('SS', '').trim();
      const exerciseRangeElement = li.querySelector('.exercise-range') as HTMLElement;
      const [setNumber, repRange] = exerciseRangeElement.innerText.split(' x ') as [string, string];

      let exerciseObj = exerciseDB.find((e) => e.name === exerciseName);

      if (!exerciseObj) {
        exerciseObj = {
          exercise_id: globalExerciseIdCounter++,
          name: exerciseName,
          muscle: muscleGroup,
          set_num: parseInt(setNumber),
          rep_range: repRange,
        };
        exerciseDB.push(exerciseObj);
        hasNewExercises = true;
      } else {
        exerciseObj.muscle = muscleGroup;
        exerciseObj.set_num = parseInt(setNumber);
        exerciseObj.rep_range = repRange;
      }

      exercisesForThisWorkout.push(exerciseObj);
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

  console.log('Schema Successfully Hydrated! Master Dictionary Length:', exerciseDB.length);
}

// INITIALIZATION & EVENT LISTENERS

window.addEventListener('DOMContentLoaded', async () => {
  await loadWorkoutData();

  initialiseSchemaFromDOM();

  const gymDaysDropdown = document.getElementById('gym-days') as HTMLSelectElement;
  const workoutLogContainer = document.getElementById('workout-log-container') as HTMLDivElement;

  if (gymDaysDropdown && workoutLogContainer) {
    gymDaysDropdown.addEventListener('change', (event) => {
      const selectedValue = (event.target as HTMLSelectElement).value;
      const workoutId = parseInt(selectedValue.replace('day-', ''));

      const targetWorkout = workoutDB.find((w) => w.workout_id === workoutId);

      if (targetWorkout) {
        renderWorkoutForm(targetWorkout);
      }
    });
  }
});

// RENDERING

function renderWorkoutForm(workout: Workout) {
  const workoutLogContainer = document.getElementById('workout-log-container') as HTMLDivElement;
  if (!workoutLogContainer) return;

  const daySelectionContainer = document.getElementById('log-selection-container') as HTMLDivElement;
  if (!daySelectionContainer) return;

  daySelectionContainer.classList.add('border-b', 'border-border', 'pb-4', 'mb-4');

  workoutLogContainer.innerHTML = `
    <div class="text-lg max-[440px]:text-base font-bold grid grid-cols-[1fr_7.5%_12.5%_12.5%] gap-3 items-center pb-4 border-b border-border" style="grid-template-columns: 1fr 12.5% 12.5%">
      <p class="text-white tracking-wider uppercase">Exercise</p>
      <p class="text-accent text-center">Reps</p>
      <p class="text-accent text-center">Kg</p>
    </div>
  `;

  workout.exercises.forEach((exercise) => {
    const row = document.createElement('div');
    row.className = 'workout-log-entry grid gap-3 items-center align-middle';
    row.style.gridTemplateColumns = '1fr 7.5% 12.5% 12.5%';
    row.dataset.exerciseId = exercise.exercise_id.toString();

    row.innerHTML = `
      <p class="max-[550px]:text-xs max-[440px]:text-[10px] font-medium ${'text-' + exercise.muscle} pr-2">${exercise.name}</p>
      <button class="option-dropdown w-fit flex justify-center align-middle p-1 max-[440px]:p-0.5 m-2 max:[440px]:m-0 border border-border rounded-full text-border cursor-pointer rotate-0">
        <svg class="fill-current size-5 max-[550px]:size-4 max-[440px]:size-3" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </button>
      <p class="exercise-reps w-full bg-transparent border border-border text-white rounded-lg text-center py-2.5 max-[550px]:py-1.5 max-[550px]:text-xs max-[440px]:py-1 max-[440px]:text-[10px] focus:ring-accent focus:border-accent appearance-none m-0 min-w-0">
        ${exercise.rep_range}
      </p>
      <p class="exercise-weight w-full bg-transparent border border-border text-white rounded-lg text-center py-2.5 max-[550px]:py-1.5 max-[550px]:text-xs max-[440px]:py-1 max-[440px]:text-[10px] focus:ring-accent focus:border-accent appearance-none m-0 min-w-0">
        0.0 
      </p>
    `;

    const dropdownContainer = document.createElement('div');
    dropdownContainer.className = 'dropdown-content w-full hidden flex flex-col gap-2 bg-surface border-b border-t border-border py-2';
    dropdownContainer.style = 'grid-column: 1 / -1';

    let setsHTML = '';
    const totalSets = exercise.set_num ? exercise.set_num : 3;

    for (let i = 1; i <= totalSets; i++) {
      setsHTML += `
        <div class="grid gap-2 items-center" style="grid-template-columns: 1fr 12.5% 12.5%" data-set-num="${i}">
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

    dropdownContainer.innerHTML = setsHTML;

    row.appendChild(dropdownContainer);

    const dropdownBtn = row.querySelector('.option-dropdown') as HTMLButtonElement;
    const icon = dropdownBtn.querySelector('svg') as SVGSVGElement;

    dropdownBtn.addEventListener('click', () => {
      icon.classList.toggle('rotate-180');
      icon.classList.toggle('rotate-0');

      dropdownContainer.classList.toggle('hidden');
    });

    workoutLogContainer.appendChild(row);
  });

  const saveButtonRow = document.createElement('div');
  saveButtonRow.className = 'mt-5 flex justify-center';
  saveButtonRow.innerHTML = `
    <button id="save-workout-btn" class="bg-surface border border-accent text-accent font-bold uppercase tracking-wider px-4 py-2  rounded-xl hover:bg-orange-500 transition-colors">
      Save Workout
    </button>
  `;

  workoutLogContainer.appendChild(saveButtonRow);

  const saveBtn = document.getElementById('save-workout-btn');

  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      const button = e.target as HTMLButtonElement;
      button.disabled = true;
      button.innerText = 'Saving...';

      const datePrefix = new Date().toISOString().split('T')[0];
      const currentSessionId = `${datePrefix}-${Date.now()}`;

      const newSession: WorkoutInstance = {
        session_id: currentSessionId,
        workout_id: workout.workout_id,
        date: new Date().toISOString(),
      };

      const exerciseRows = document.querySelectorAll('.workout-log-entry');
      let instanceIdCounter = 1;

      const exerciseGroups = new Map<number, { num: number; reps: number; weight: number }[]>();

      exerciseRows.forEach((exerciseRow) => {
        const exerciseId = parseInt(exerciseRow.getAttribute('data-exercise-id') || '0', 10);

        const setRows = exerciseRow.querySelectorAll('[data-set-num]');

        setRows.forEach((setRow) => {
          const setNum = parseInt(setRow.getAttribute('data-set-num') || '1', 10);
          const reps = parseInt((setRow.querySelector('.exercise-reps') as HTMLInputElement)?.value, 10) || 0;
          const weight = parseFloat((setRow.querySelector('.exercise-weight') as HTMLInputElement)?.value) || 0;

          if (reps > 0) {
            if (!exerciseGroups.has(exerciseId)) {
              exerciseGroups.set(exerciseId, []);
            }
            exerciseGroups.get(exerciseId)?.push({ num: setNum, reps, weight });
          }
        });
      });

      exerciseGroups.forEach((sets, exerciseId) => {
        const newInstance: ExerciseInstance = {
          instance_id: `${currentSessionId}-${instanceIdCounter++}`,
          session_id: currentSessionId,
          exercise_id: exerciseId,
          sets: sets,
        };
        myExerciseInstances.push(newInstance);
      });

      mySessions.push(newSession);

      await saveWorkoutData();

      button.innerText = 'Saved!';
      button.classList.replace('text-accent', 'text-green-500');
      button.classList.replace('border-accent', 'border-green-500');

      setTimeout(() => {
        button.disabled = false;
        button.innerText = 'Save Workout';

        button.classList.replace('text-green-500', 'text-accent');
        button.classList.replace('border-green-500', 'border-accent');
      }, 2000);
    });
  }
}

// DATA STORAGE

let mySessions: WorkoutInstance[] = [];
let myExerciseInstances: ExerciseInstance[] = [];

const FILE_NAME = 'workout-data.json';

async function loadWorkoutData() {
  try {
    const contents = await Filesystem.readFile({
      path: FILE_NAME,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    const data = JSON.parse(contents.data as string);

    mySessions = data.sessions || [];
    myExerciseInstances = data.instances || [];

    exerciseDB = data.exercises || [];

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
    globalExerciseIdCounter = 1;
  }
}

async function saveWorkoutData() {
  const dataToSave = {
    sessions: mySessions,
    instances: myExerciseInstances,
    exercises: exerciseDB,
  };

  try {
    await Filesystem.writeFile({
      path: FILE_NAME,
      data: JSON.stringify(dataToSave, null, 2),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });

    console.log('Workout securely saved to local device!');
  } catch (err: any) {
    console.error('Error writing file:', err);
    alert(`Failed to save to device: ${err.message}`);
  }
}
