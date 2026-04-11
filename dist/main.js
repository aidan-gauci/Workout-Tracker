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
import { Capacitor } from '@capacitor/core';
let activeWorkoutState = [];
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
            const [minReps, maxReps] = repRange.split('-');
            let exerciseObj = exerciseDB.find((e) => e.name === exerciseName);
            if (!exerciseObj) {
                exerciseObj = {
                    exercise_id: globalExerciseIdCounter++,
                    name: exerciseName,
                    muscle: muscleGroup,
                };
                exerciseDB.push(exerciseObj);
                hasNewExercises = true;
            }
            else {
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
window.addEventListener('DOMContentLoaded', () => __awaiter(void 0, void 0, void 0, function* () {
    yield loadWorkoutData();
    initialiseSchemaFromDOM();
    catchExerciseData();
    setupGlobalEventListeners();
}));
function setupGlobalEventListeners() {
    const workoutAnalysisContainer = document.getElementById('workout-analysis-container');
    const gymDaysDropdown = document.getElementById('gym-days');
    const workoutLogContainer = document.getElementById('workout-log-container');
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
function handleAnalysisClicks(event) {
    const target = event.target;
    if (target.closest('#preset-analysis-btn'))
        initiatePresetAnalysis(target);
    if (target.closest('#live-analysis-btn'))
        initiateLiveAnalysis(target);
}
function handleWorkoutSelection(event) {
    const selectedValue = event.target.value;
    const workoutId = parseInt(selectedValue.replace('day-', ''));
    const targetWorkout = workoutDB.find((w) => w.workout_id === workoutId);
    if (targetWorkout) {
        renderWorkoutLogForm(targetWorkout);
    }
}
function handleWorkoutInput(event) {
    const target = event.target;
    if (!target.matches('input.exercise-reps, input.exercise-weight'))
        return;
    const row = target.closest('.workout-log-entry');
    const setEntry = target.closest('.set-entry');
    if (!row || !setEntry)
        return;
    const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);
    const setNum = parseInt(setEntry.getAttribute('data-set-num') || '0', 10);
    updateActiveStateData(exerciseId, setNum, target);
}
function handleWorkoutClicks(event) {
    const target = event.target;
    const dropdownBtn = target.closest('.option-dropdown');
    if (dropdownBtn)
        return toggleSetDropdown(dropdownBtn);
    const deleteBtn = target.closest('.exercise-delete');
    if (deleteBtn)
        return removeExercise(deleteBtn);
    const delSetBtn = target.closest('.del-set');
    if (delSetBtn)
        return removeSet(delSetBtn);
    const addSetBtn = target.closest('.add-set');
    if (addSetBtn)
        return addSet(addSetBtn);
}
function updateActiveStateData(exerciseId, setNum, target) {
    const exerciseState = activeWorkoutState.find((ex) => ex.exercise_id === exerciseId);
    if (!exerciseState)
        return;
    const set = exerciseState.sets.find((s) => s.num === setNum);
    if (!set)
        return;
    if (target.classList.contains('exercise-reps')) {
        set.reps = parseInt(target.value, 10) || 0;
    }
    else if (target.classList.contains('exercise-weight')) {
        set.weight = parseFloat(target.value) || 0;
    }
}
function initiatePresetAnalysis(btn) {
    if (workoutDB.length === 0) {
        return showInlineWarning(btn, 'No Workouts Found');
    }
    const analysisContainer = document.getElementById('workout-analysis-container');
    if (analysisContainer) {
        analysisContainer.classList = 'flex flex-col items-center w-full';
        analysisContainer.innerHTML = createWorkoutSelectionMenu();
    }
}
function initiateLiveAnalysis(btn) {
    const hasData = activeWorkoutState.some((ex) => ex.sets.some((s) => s.reps > 0));
    if (!hasData) {
        return showInlineWarning(btn, 'Log a set first!');
    }
    const analysisContainer = document.getElementById('workout-analysis-container');
    if (analysisContainer) {
        analysisContainer.classList = 'flex flex-col items-center w-full';
        analysisContainer.innerHTML = createLiveConfirmationMenu();
    }
}
function toggleSetDropdown(btn) {
    const row = btn.closest('.workout-log-entry');
    const dropdownContainer = row === null || row === void 0 ? void 0 : row.querySelector('.dropdown-content');
    const dropdownIcon = btn.querySelector('svg');
    if (dropdownContainer && dropdownIcon) {
        dropdownIcon.classList.toggle('rotate-180');
        dropdownIcon.classList.toggle('rotate-0');
        dropdownContainer.classList.toggle('hidden');
    }
}
function removeExercise(btn) {
    const row = btn.closest('.workout-log-entry');
    const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);
    if (document.querySelectorAll('.workout-log-entry').length > 1) {
        row.remove();
        activeWorkoutState = activeWorkoutState.filter((ex) => ex.exercise_id !== exerciseId);
    }
    else {
        showTooltipWarning(btn, 'Need 1 Exercise!');
    }
}
function removeSet(btn) {
    const dropdownContainer = btn.closest('.dropdown-content');
    const setEntries = dropdownContainer.querySelectorAll('.set-entry');
    const row = dropdownContainer.closest('.workout-log-entry');
    const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);
    if (setEntries.length > 1) {
        setEntries[setEntries.length - 1].remove();
        const exState = activeWorkoutState.find((ex) => ex.exercise_id === exerciseId);
        if (exState)
            exState.sets.pop();
    }
    else {
        showInlineWarning(btn, 'Min 1 Set');
    }
}
function addSet(btn) {
    const dropdownContainer = btn.closest('.dropdown-content');
    const setEntries = dropdownContainer.querySelectorAll('.set-entry');
    const row = dropdownContainer.closest('.workout-log-entry');
    const exerciseId = parseInt(row.getAttribute('data-exercise-id') || '0', 10);
    if (setEntries.length < 5) {
        const newSetNum = setEntries.length + 1;
        btn.parentElement.insertAdjacentHTML('beforebegin', createNewSet(newSetNum));
        const exState = activeWorkoutState.find((ex) => ex.exercise_id === exerciseId);
        if (exState)
            exState.sets.push({ num: newSetNum, reps: 0, weight: 0 });
    }
    else {
        showInlineWarning(btn, 'Max 5 Sets');
    }
}
function showInlineWarning(btn, warningText) {
    if (btn.dataset.warning === 'true')
        return;
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
function showTooltipWarning(btn, warningText) {
    if (btn.dataset.warning === 'true')
        return;
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
function buildJoinedExercises(workout) {
    return workout.exercises
        .map((prescription) => {
        const details = exerciseDB.find((e) => e.exercise_id === prescription.exercise_id);
        return Object.assign(Object.assign({}, details), prescription);
    })
        .filter((e) => e.name !== undefined);
}
function initActiveState(joinedExercises) {
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
function getPastPerformance(exerciseId) {
    const instances = myExerciseInstances.filter((inst) => inst.exercise_id === exerciseId);
    const instancesWithDates = instances.map((inst) => {
        const session = mySessions.find((s) => s.session_id === inst.session_id);
        return Object.assign(Object.assign({}, inst), { date: session ? new Date(session.date).getTime() : 0 });
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
        });
    }
    return result;
}
let fullExercisePerformance = {};
function catchExerciseData() {
    fullExercisePerformance = {};
    for (let i = 1; i < globalExerciseIdCounter; i++) {
        fullExercisePerformance[i] = getPastPerformance(i);
    }
}
function getRepRange(exerciseId) {
    for (const workout of workoutDB) {
        const exerciseMatch = workout.exercises.find((ex) => ex.exercise_id === exerciseId);
        if (exerciseMatch) {
            return [exerciseMatch.reps.min_reps, exerciseMatch.reps.max_reps];
        }
    }
    return null;
}
function computePerformance(entry) {
    let totalScore = 0;
    let totalReps = 0;
    entry.sets.forEach((set) => {
        if (set.weight > 0) {
            totalScore += set.weight * (1 + set.reps / 30);
            totalReps += set.reps;
        }
        else {
            totalScore += set.reps;
            totalReps += set.reps;
        }
    });
    const averageScore = Math.round((totalScore * 10) / entry.sets.length) / 10;
    const averageReps = Math.round((totalReps * 10) / entry.sets.length) / 10;
    return [averageScore, averageReps];
}
function analysePerformance(exerciseId) {
    var _a;
    try {
        if (Object.keys(fullExercisePerformance).length === 0)
            catchExerciseData();
        let performance = fullExercisePerformance[exerciseId];
        if (!performance || performance.length < 2 || ((_a = performance[0]) === null || _a === void 0 ? void 0 : _a.session_id) === 'none') {
            throw new Error('Not enough data for this exercise.');
        }
        console.log(performance);
        let statusCode = 'bad';
        let reportCode = 0;
        let newPerformance = computePerformance(performance[0]);
        let oldPerformance = computePerformance(performance[1]);
        if (newPerformance[0] > oldPerformance[0])
            statusCode = 'good';
        else
            statusCode = 'bad';
        const repRange = getRepRange(exerciseId);
        let min = 0;
        let max = 0;
        if (repRange) {
            [min, max] = repRange;
        }
        else {
            throw new Error('Invalid Exercise ID or missing rep range.');
        }
        if (newPerformance[1] < min)
            reportCode = -1;
        else if (newPerformance[1] > max)
            reportCode = 1;
        else
            reportCode = 0;
        return {
            exercise_id: exerciseId,
            status: statusCode,
            report_code: reportCode,
            prev_perf: oldPerformance,
            curr_perf: newPerformance,
        };
    }
    catch (error) {
        if (error instanceof Error) {
            console.warn(`Analysis skipped for Exercise ${exerciseId}: ${error.message}`);
        }
        else {
            console.error('An unknown error occurred during analysis.', error);
        }
        return null;
    }
}
function catchWorkoutAnalysis(workoutId) {
    const workout = workoutDB.find((workout) => workout.workout_id === workoutId);
    const workoutAnalysis = [];
    let tempAnalysis = null;
    workout === null || workout === void 0 ? void 0 : workout.exercises.forEach((exercise) => {
        tempAnalysis = analysePerformance(exercise.exercise_id);
        if (tempAnalysis)
            workoutAnalysis.push(tempAnalysis);
    });
    return workoutAnalysis;
}
function catchLiveAnalysis(activeInstances) {
    const liveAnalysis = [];
    activeInstances.forEach((instance) => {
        const analysis = analysePerformance(instance.exercise_id);
        if (analysis)
            liveAnalysis.push(analysis);
    });
    return liveAnalysis;
}
function createWorkoutSelectionMenu() {
    return `
    <label for="preset-analysis-dropdown" class="block text-sm font-bold text-muted uppercase tracking-wider mb-2">Select a Preset to Analyse</label>
    <div class="relative">
      <select id="preset-analysis-dropdown" class="block w-full bg-surface border border-border text-white text-sm rounded-lg focus:ring-orange-600 focus:border-orange-600 p-2.5 appearance-none cursor-pointer">
        <option selected disabled class="text-center">Choose a Day</option>
        <option value="day-1">1. Chest & Biceps</option>
        <option value="day-2">2. Back & Triceps</option>
        <option value="day-3">3. Legs & Abs</option>
        <option value="day-4">4. Shoulders & Arms</option>
        <option value="day-5">5. Chest & Back</option>
        <option value="day-6">6. Legs & Abs</option>
      </select>

      <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted">
        <svg class="fill-current h-4 w-4" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
    
    <div class="flex flex-row gap-3">
      <button id="cancel-preset-analysis-btn" class="">Cancel</button>
      <button id="confirm-preset-analysis-btn" class="">Analyze Workout</button>
    </div>
  `;
}
function createLiveConfirmationMenu() {
    return `
    <div id="live-confirmation-container" class="flex flex-col items-center w-full">
      
      <h3 class="">Are you finished logging?</h3>
      <p class="">Ensure all sets and weights are updated before running your live analysis.</p>

      <div class="flex flex-row gap-3">
        <button id="cancel-live-analysis-btn" class="">Go Back</button>
        <button id="confirm-live-analysis-btn" class="">Run Analysis</button>
      </div>

    </div>
  `;
}
function createLogHeader() {
    return `
    <div class="text-lg max-[440px]:text-base font-bold grid grid-cols-[1fr_7.5%_12.5%_12.5%] gap-3 items-center pb-4 border-b border-border" style="grid-template-columns: 1fr 12.5% 12.5%">
      <p class="text-white tracking-wider uppercase">Exercise</p>
      <p class="text-accent text-center">Reps</p>
      <p class="text-accent text-center">Kg</p>
    </div>
  `;
}
function createExerciseRow(exercise) {
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
function createNewSet(i) {
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
function setActionButtons(workoutId, container) {
    var _a, _b;
    const saveButtonRow = document.createElement('div');
    saveButtonRow.className = 'mt-5 flex flex-row justify-center gap-3';
    saveButtonRow.innerHTML = `
    <button id="save-workout-btn" class="bg-surface border border-accent text-accent font-bold max-[550px]:text-xs max-[440px]:text-[10px] uppercase tracking-wider px-4 py-2 rounded-xl hover:scale-105 transition-transform duration-200 ease-in-out cursor-pointer">Save Workout</button>
    <button id="export-workout-btn" class="bg-surface border border-accent text-accent font-bold max-[550px]:text-xs max-[440px]:text-[10px] uppercase tracking-wider px-4 py-2 rounded-xl hover:scale-105 transition-transform duration-200 ease-in-out cursor-pointer">Export Data</button>
  `;
    container.appendChild(saveButtonRow);
    let activeSessionId = null;
    (_a = document.getElementById('save-workout-btn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', (e) => __awaiter(this, void 0, void 0, function* () {
        const button = e.target;
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
                    session_id: activeSessionId,
                    exercise_id: exerciseState.exercise_id,
                    sets: validSets,
                });
            }
        });
        yield saveWorkoutData();
        setButtonSuccessState(button, 'Saved!', 'Save Workout');
    }));
    (_b = document.getElementById('export-workout-btn')) === null || _b === void 0 ? void 0 : _b.addEventListener('click', (e) => __awaiter(this, void 0, void 0, function* () {
        const button = e.target;
        setButtonLoadingState(button, 'Exporting...');
        yield exportWorkoutData();
        setButtonSuccessState(button, 'Exported!', 'Export Data');
    }));
}
function setButtonLoadingState(btn, text) {
    btn.disabled = true;
    btn.innerText = text;
}
function setButtonSuccessState(btn, successText, defaultText) {
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
function renderWorkoutLogForm(workout) {
    const workoutLogContainer = document.getElementById('workout-log-container');
    const daySelectionContainer = document.getElementById('log-selection-container');
    if (!workoutLogContainer || !daySelectionContainer)
        return;
    daySelectionContainer.classList.add('border-b', 'border-border', 'pb-4', 'mb-4');
    workoutLogContainer.innerHTML = createLogHeader();
    const joinedExercises = buildJoinedExercises(workout);
    initActiveState(joinedExercises);
    joinedExercises.forEach((exercise) => {
        const rowElement = createExerciseRow(exercise);
        workoutLogContainer.appendChild(rowElement);
    });
    setActionButtons(workout.workout_id, workoutLogContainer);
}
let mySessions = [];
let myExerciseInstances = [];
const FILE_NAME = 'workout-data.json';
export function loadWorkoutData() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const contents = yield Filesystem.readFile({
                path: FILE_NAME,
                directory: Directory.Data,
                encoding: Encoding.UTF8,
            });
            const data = JSON.parse(contents.data);
            mySessions = data.sessions || [];
            myExerciseInstances = data.instances || [];
            exerciseDB = data.exercises || [];
            workoutDB = data.workouts || [];
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
            workoutDB = [];
            globalExerciseIdCounter = 1;
        }
    });
}
let isSaving = false;
export function saveWorkoutData() {
    return __awaiter(this, void 0, void 0, function* () {
        if (isSaving)
            return;
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
            yield Filesystem.writeFile({
                path: FILE_NAME,
                data: JSON.stringify(dataToSave, null, 2),
                directory: Directory.Data,
                encoding: Encoding.UTF8,
            });
            console.log('Workout securely saved!');
        }
        catch (err) {
            console.error('Error writing file:', err);
            if (err.message.includes('closing')) {
                console.warn('Database busy, save postponed.');
            }
            else {
                alert(`Failed to save database: ${err.message}`);
            }
        }
        finally {
            isSaving = false;
        }
    });
}
export function exportWorkoutData() {
    return __awaiter(this, void 0, void 0, function* () {
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
                yield Filesystem.mkdir({
                    path: FOLDER_NAME,
                    directory: Directory.Documents,
                    recursive: false,
                });
            }
            catch (mkdirErr) {
                console.log('Folder already exists, proceeding to save...');
            }
            yield Filesystem.writeFile({
                path: `${FOLDER_NAME}/${exportFileName}`,
                data: jsonString,
                directory: Directory.Documents,
                encoding: Encoding.UTF8,
            });
            alert(`Success! Saved to Documents/${FOLDER_NAME}/${exportFileName}`);
        }
        catch (err) {
            console.error('Error exporting file:', err);
            alert(`Failed to export backup: ${err.message}`);
        }
    });
}
//# sourceMappingURL=main.js.map