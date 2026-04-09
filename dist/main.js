var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
let exerciseDB = [];
let workoutDB = [];
let globalExerciseIdCounter = 1;
function initialiseSchemaFromDOM() {
    workoutDB = [];
    let hasNewExercises = false;
    const articles = document.querySelectorAll('article');
    articles.forEach((article, index) => {
        var _a;
        const workoutName = ((_a = article.querySelector('h2')) === null || _a === void 0 ? void 0 : _a.innerText.trim()) || `Workout ${index + 1}`;
        const workoutId = index + 1;
        const exercisesForThisWorkout = [];
        const listItems = article.querySelectorAll('li');
        listItems.forEach((li) => {
            const nameElement = li.querySelector('.exercise-name');
            if (!nameElement)
                return;
            let muscleGroup = 'chest';
            const classes = Array.from(nameElement.classList);
            const muscleClass = classes.find((c) => c.startsWith('text-') && c !== 'text-s' && c !== 'text-sm' && c !== 'text-text');
            if (muscleClass) {
                muscleGroup = muscleClass.replace('text-', '');
            }
            const exerciseName = nameElement.innerText.replace('SS', '').trim();
            const exerciseRangeElement = li.querySelector('.exercise-range');
            const [setNumber, repRange] = exerciseRangeElement.innerText.split(' x ');
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
            }
            else {
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
window.addEventListener('DOMContentLoaded', () => __awaiter(void 0, void 0, void 0, function* () {
    yield loadWorkoutData();
    initialiseSchemaFromDOM();
    const gymDaysDropdown = document.getElementById('gym-days');
    const workoutLogContainer = document.getElementById('workout-log-container');
    if (gymDaysDropdown && workoutLogContainer) {
        gymDaysDropdown.addEventListener('change', (event) => {
            const selectedValue = event.target.value;
            const workoutId = parseInt(selectedValue.replace('day-', ''));
            const targetWorkout = workoutDB.find((w) => w.workout_id === workoutId);
            if (targetWorkout) {
                renderWorkoutForm(targetWorkout);
            }
        });
    }
}));
function renderWorkoutForm(workout) {
    const workoutLogContainer = document.getElementById('workout-log-container');
    if (!workoutLogContainer)
        return;
    const daySelectionContainer = document.getElementById('log-selection-container');
    if (!daySelectionContainer)
        return;
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
      <div class="flex flex-row gap-4 ml-2 max-[440px]:gap-2 max-[440px]:ml-1 items-center">
        <button class="exercise-delete w-fit relative transition-colors duration-200 ease-in-out flex justify-center align-middle p-1 max-[440px]:p-0.5 border border-border rounded-full text-border cursor-pointer">
          <svg class="fill-current size-4 max-[440px]:size-3" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd" />
          </svg>
        </button>
        <p class="max-[550px]:text-sm max-[440px]:text-xs font-medium ${'text-' + exercise.muscle} pr-2">${exercise.name}</p>
      </div>
      <button class="option-dropdown w-fit flex justify-center align-middle p-1 max-[440px]:p-0.5 mx-auto max:[440px]:m-0 border border-border rounded-full text-border cursor-pointer rotate-0">
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
        <div class="grid gap-3 items-center" style="grid-template-columns: 1fr 7.5% 12.5% 12.5%" data-set-num="${i}">
          <p class="exercise-set max-[440px]:text-[10px]">Set ${i}:</p>
          <div class="w-fit flex flex-row gap-2 justify-center rounded-full mx-auto px-2 max-[440px]:px-1">
            <button class="add-set w-fit relative flex justify-center align-middle mx-auto p-1 max-[440px]:p-0.5 border border-border rounded-full text-border cursor-pointer">
              <svg class="fill-current size-4 max-[440px]:size-3" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 4a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 0110 4z" clip-rule="evenodd" />
              </svg>
            </button>
            <button class="del-set w-fit relative flex justify-center align-middle p-1 max-[440px]:p-0.5 border border-border rounded-full text-border cursor-pointer">
              <svg class="fill-current size-4 max-[440px]:size-3" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
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
        const dropdownBtn = row.querySelector('.option-dropdown');
        const dropdownIcon = dropdownBtn.querySelector('svg');
        dropdownBtn.addEventListener('click', () => {
            dropdownIcon.classList.toggle('rotate-180');
            dropdownIcon.classList.toggle('rotate-0');
            dropdownContainer.classList.toggle('hidden');
        });
        const deleteBtn = row.querySelector('.exercise-delete');
        const deletePopup = document.createElement('span');
        deletePopup.classList =
            'w-fit absolute top-full mt-2 px-2 py-1 opacity-0 transition-opacity duration-200 ease-in-out bg-red-700 text-[10px] text-white border border-white rounded-full whitespace-nowrap';
        deletePopup.innerText = 'Need 1 Exercise!';
        let warningFlag = false;
        deleteBtn.addEventListener('click', () => {
            if (document.querySelectorAll('.workout-log-entry').length > 1) {
                row.remove();
            }
            else {
                if (warningFlag)
                    return;
                warningFlag = true;
                deleteBtn.classList.remove('border-border', 'text-border');
                deleteBtn.classList.add('border-white', 'text-white', 'bg-red-700');
                deleteBtn.appendChild(deletePopup);
                setTimeout(() => {
                    deletePopup.classList.remove('opacity-0');
                    deletePopup.classList.add('opacity-100');
                }, 10);
                setTimeout(() => {
                    deleteBtn.classList.remove('border-white', 'text-white', 'bg-red-700');
                    deleteBtn.classList.add('border-border', 'text-border');
                    deletePopup.classList.remove('opacity-100');
                    deletePopup.classList.add('opacity-0');
                    setTimeout(() => {
                        deleteBtn.removeChild(deletePopup);
                        warningFlag = false;
                    }, 200);
                }, 2000);
            }
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
        saveBtn.addEventListener('click', (e) => __awaiter(this, void 0, void 0, function* () {
            const button = e.target;
            button.disabled = true;
            button.innerText = 'Saving...';
            const datePrefix = new Date().toISOString().split('T')[0];
            const currentSessionId = `${datePrefix}-${Date.now()}`;
            const newSession = {
                session_id: currentSessionId,
                workout_id: workout.workout_id,
                date: new Date().toISOString(),
            };
            const exerciseRows = document.querySelectorAll('.workout-log-entry');
            let instanceIdCounter = 1;
            const exerciseGroups = new Map();
            exerciseRows.forEach((exerciseRow) => {
                const exerciseId = parseInt(exerciseRow.getAttribute('data-exercise-id') || '0', 10);
                const setRows = exerciseRow.querySelectorAll('[data-set-num]');
                setRows.forEach((setRow) => {
                    var _a, _b, _c;
                    const setNum = parseInt(setRow.getAttribute('data-set-num') || '1', 10);
                    const reps = parseInt((_a = setRow.querySelector('.exercise-reps')) === null || _a === void 0 ? void 0 : _a.value, 10) || 0;
                    const weight = parseFloat((_b = setRow.querySelector('.exercise-weight')) === null || _b === void 0 ? void 0 : _b.value) || 0;
                    if (reps > 0) {
                        if (!exerciseGroups.has(exerciseId)) {
                            exerciseGroups.set(exerciseId, []);
                        }
                        (_c = exerciseGroups.get(exerciseId)) === null || _c === void 0 ? void 0 : _c.push({ num: setNum, reps, weight });
                    }
                });
            });
            exerciseGroups.forEach((sets, exerciseId) => {
                const newInstance = {
                    instance_id: `${currentSessionId}-${instanceIdCounter++}`,
                    session_id: currentSessionId,
                    exercise_id: exerciseId,
                    sets: sets,
                };
                myExerciseInstances.push(newInstance);
            });
            mySessions.push(newSession);
            yield saveWorkoutData();
            button.innerText = 'Saved!';
            button.classList.replace('text-accent', 'text-green-500');
            button.classList.replace('border-accent', 'border-green-500');
            setTimeout(() => {
                button.disabled = false;
                button.innerText = 'Save Workout';
                button.classList.replace('text-green-500', 'text-accent');
                button.classList.replace('border-green-500', 'border-accent');
            }, 2000);
        }));
    }
}
let mySessions = [];
let myExerciseInstances = [];
const FILE_NAME = 'workout-data.json';
function loadWorkoutData() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const contents = yield Filesystem.readFile({
                path: FILE_NAME,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            const data = JSON.parse(contents.data);
            mySessions = data.sessions || [];
            myExerciseInstances = data.instances || [];
            exerciseDB = data.exercises || [];
            if (exerciseDB.length > 0) {
                const maxId = Math.max(...exerciseDB.map((e) => e.exercise_id));
                globalExerciseIdCounter = maxId + 1;
            }
            else {
                globalExerciseIdCounter = 1;
            }
            console.log('Local load complete. Current sessions:', mySessions.length);
        }
        catch (err) {
            console.log('No existing save file found. Starting with an empty log.');
            mySessions = [];
            myExerciseInstances = [];
            exerciseDB = [];
            globalExerciseIdCounter = 1;
        }
    });
}
function saveWorkoutData() {
    return __awaiter(this, void 0, void 0, function* () {
        const dataToSave = {
            sessions: mySessions,
            instances: myExerciseInstances,
            exercises: exerciseDB,
        };
        try {
            yield Filesystem.writeFile({
                path: FILE_NAME,
                data: JSON.stringify(dataToSave, null, 2),
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            console.log('Workout securely saved to local device!');
        }
        catch (err) {
            console.error('Error writing file:', err);
            alert(`Failed to save to device: ${err.message}`);
        }
    });
}
//# sourceMappingURL=main.js.map