class SudokuGame {
    constructor() {
        this.board = Array(9).fill().map(() => Array(9).fill(0));
        this.solution = Array(9).fill().map(() => Array(9).fill(0));
        this.initialBoard = Array(9).fill().map(() => Array(9).fill(0));
        this.memos = Array(9).fill().map(() => Array(9).fill().map(() => new Set()));
        this.selectedCell = { row: -1, col: -1 };
        this.timer = 0;
        this.timerInterval = null;
        this.isGameOver = false;
        this.isMemoMode = false;
        this.history = []; // ◀ 이전 행동들을 저장할 스택 배열 추가
        this.useNewAlgorithm = true; // ◀ 새 게임 시작 시 토글되어 false(오리지널 랜덤)로 첫 게임이 시작됩니다.

        this.initDOM();
        this.addEventListeners();
        this.checkAndRestoreGame(); // ◀ 세션 복구 의사 확인 후 게임 세팅
    }

    initDOM() {
        this.gridElement = document.getElementById('sudoku-board');
        this.timerElement = document.getElementById('timer');
        this.difficultySelect = document.getElementById('difficulty-select');
        this.newGameBtn = document.getElementById('new-game-btn');
        this.memoBtn = document.getElementById('memo-btn');
        this.undoBtn = document.getElementById('undo-btn'); // ◀ 추가
        this.themeToggleBtn = document.getElementById('theme-toggle-btn'); // ◀ 다크모드 버튼 추가
        this.messageElement = document.getElementById('message');
        this.difficultyDisplay = document.getElementById('difficulty-display');
        this.algoDisplayElement = document.getElementById('algo-display'); // ◀ 알고리즘 표시 요소 추가
        
        // ◀ 복구 확인 모달 요소 바인딩
        this.restoreModal = document.getElementById('restore-modal');
        this.restoreYesBtn = document.getElementById('restore-yes-btn');
        this.restoreNoBtn = document.getElementById('restore-no-btn');

        // ◀ 축하 모달 요소 바인딩
        this.winModal = document.getElementById('win-modal');
        this.winNewGameBtn = document.getElementById('win-new-game-btn');
        this.winCloseBtn = document.getElementById('win-close-btn');
        this.winTimeDisplay = document.getElementById('win-time-display');

        // 💡 첫 로딩 시 기존에 저장된 테마 불러오기
        const savedTheme = localStorage.getItem('sudoku-theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        this.updateThemeButton(savedTheme);

        // Create cells
        this.gridElement.innerHTML = '';
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                this.gridElement.appendChild(cell);
            }
        }
        this.cells = document.querySelectorAll('.cell');
    }

    addEventListeners() {
        this.gridElement.addEventListener('click', (e) => {
            const cell = e.target.closest('.cell');
            if (cell) {
                this.selectCell(parseInt(cell.dataset.row), parseInt(cell.dataset.col));
            }
        });

        let pressTimer = null;
        let isLongPress = false;
        const LONG_PRESS_TIME = 400; // 길게 누르기 기준 시간 (0.4초)

        document.querySelectorAll('.numpad-btn').forEach(btn => {
            const val = btn.dataset.number;

            // 💡 [버그 수정] '되돌리기' 버튼은 data-number 속성이 없으므로(undefined), 이 루프의 타이머 로직에서 제외합니다.
            if (!val) return; 

            // 1. '지우기' 버튼은 기존처럼 그냥 클릭하면 바로 지워지도록 예외 처리
            if (val === 'erase') {
                btn.addEventListener('click', () => this.inputNumber(0));
                return;
            }

            // 2. 마우스 또는 터치가 눌리기 시작할 때 타이머 작동
            const startPress = (e) => {
                e.preventDefault(); // 모바일 줌이나 더블탭 방지
                isLongPress = false;

                // 0.4초 뒤에 실행될 타이머 세팅
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    this.handleNumpadInput(parseInt(val), false); // ◀ false = 메모 아님 (진짜 숫자 입력)
                    
                    if (navigator.vibrate) navigator.vibrate(30); // 안드로이드 등 지원 기기 진동
                }, LONG_PRESS_TIME);
            };

            // 3. 마우스 또는 터치가 떼어졌을 때
            const endPress = (e) => {
                if (pressTimer) {
                    clearTimeout(pressTimer); // 길게 누르기 전에 뗐다면 타이머 취소
                }

                // 길게 누른 게 아니라면 (즉, 짧게 클릭했다면)
                if (!isLongPress && e.type !== 'contextmenu') {
                    this.handleNumpadInput(parseInt(val), true); // ◀ true = 메모 모드로 입력
                }
            };

            // PC(마우스)와 모바일(터치) 이벤트 모두 대응
            btn.addEventListener('mousedown', startPress);
            btn.addEventListener('mouseup', endPress);
            btn.addEventListener('touchstart', startPress, { passive: false });
            btn.addEventListener('touchend', endPress);
            
            // 혹시 버튼 바깥으로 마우스가 나가면 타이머 취소
            btn.addEventListener('mouseleave', () => { if (pressTimer) clearTimeout(pressTimer); });
        });

        document.addEventListener('keydown', (e) => {
            if (this.isGameOver) return;
            
            if (e.key >= '1' && e.key <= '9') {
                this.inputNumber(parseInt(e.key));
            } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
                this.inputNumber(0);
            } else if (e.key.toLowerCase() === 'm') {
                this.toggleMemoMode();
            } else if (e.key.startsWith('Arrow')) {
                this.handleArrowKey(e.key);
            }
        });

        this.newGameBtn.addEventListener('click', () => this.startNewGame());
        this.undoBtn.addEventListener('click', () => this.undo()); // ◀ 이제 정상 작동합니다!
        this.difficultySelect.addEventListener('change', () => this.startNewGame());

        // 💡 테마 토글 클릭 이벤트 추가
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());

        // ◀ 세션 복구 모달 버튼 이벤트 추가
        if (this.restoreYesBtn && this.restoreNoBtn) {
            this.restoreYesBtn.addEventListener('click', () => {
                this.restoreModal.style.display = 'none';
                this.loadGameState();
            });
            this.restoreNoBtn.addEventListener('click', () => {
                this.restoreModal.style.display = 'none';
                this.clearSavedState();
                this.startNewGame();
            });
        }

        // ◀ 축하 모달 버튼 이벤트 추가
        if (this.winNewGameBtn && this.winCloseBtn) {
            this.winNewGameBtn.addEventListener('click', () => {
                if (this.winModal) this.winModal.style.display = 'none';
                this.startNewGame();
            });
            this.winCloseBtn.addEventListener('click', () => {
                if (this.winModal) this.winModal.style.display = 'none';
            });
        }

        // ◀ 브라우저 새로고침/탭 닫기 방지 경고 및 나갈 때 타이머 저장
        window.addEventListener('beforeunload', (e) => {
            if (!this.isGameOver && this.hasUserMoves()) {
                this.saveGameState(); // 이탈 시점의 최신 타이머 & 상태 동기화 저장
                e.preventDefault();
                e.returnValue = ''; // 브라우저 이탈 방지 창 띄우기
            }
        });
    }

    toggleMemoMode() {
        this.isMemoMode = !this.isMemoMode;
        this.memoBtn.textContent = `메모: ${this.isMemoMode ? 'ON' : 'OFF'}`;
        this.memoBtn.classList.toggle('active', this.isMemoMode);
    }

    updateAlgoDisplay() {
        if (this.algoDisplayElement) {
            this.algoDisplayElement.textContent = `생성: ${this.useNewAlgorithm ? '대칭/추론' : '랜덤'}`;
        }
    }

    startNewGame() {
        this.isGameOver = false;
        if (this.winModal) this.winModal.style.display = 'none';
        this.messageElement.textContent = '';
        this.messageElement.style.color = '';
        this.memos = Array(9).fill().map(() => Array(9).fill().map(() => new Set()));
        this.history = [];
        this.clearSavedState(); // 신규 게임 생성 시 이전 세션 정보 초기화

        // 알고리즘 방식 번갈아 토글
        this.useNewAlgorithm = !this.useNewAlgorithm;
        this.updateAlgoDisplay();

        const difficulty = this.difficultySelect.value;
        const difficultyText = this.difficultySelect.options[this.difficultySelect.selectedIndex].text;
        this.difficultyDisplay.textContent = `난이도: ${difficultyText}`;

        this.generateSudoku();
        if (this.useNewAlgorithm) {
            this.removeNumbersSymmetric(difficulty);
        } else {
            this.removeNumbersOriginal(difficulty);
        }
        this.renderBoard();
        this.resetTimer();
        this.startTimer();
        this.selectCell(0, 0);
    }

    generateSudoku() {
        this.board = Array(9).fill().map(() => Array(9).fill(0));
        this.fillBoard(this.board);
        this.solution = this.board.map(row => [...row]);
    }

    fillBoard(board) {
        for (let i = 0; i < 81; i++) {
            let row = Math.floor(i / 9);
            let col = i % 9;
            if (board[row][col] === 0) {
                let numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                this.shuffle(numbers);
                for (let num of numbers) {
                    if (this.isValid(board, row, col, num)) {
                        board[row][col] = num;
                        if (this.fillBoard(board)) return true;
                        board[row][col] = 0;
                    }
                }
                return false;
            }
        }
        return true;
    }

    isValid(board, row, col, num) {
        for (let x = 0; x < 9; x++) {
            if (board[row][x] === num || board[x][col] === num) return false;
        }
        let startRow = row - row % 3;
        let startCol = col - col % 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (board[i + startRow][j + startCol] === num) return false;
            }
        }
        return true;
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    countSolutions(tempBoard, limit = 2) {
        let solutionsCount = 0;
        
        const solve = (grid) => {
            if (solutionsCount >= limit) return;
            
            let row = -1;
            let col = -1;
            let minCandidates = 10;
            
            // MRV(Minimum Remaining Values) 휴리스틱으로 속도 최적화
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (grid[r][c] === 0) {
                        let candidates = 0;
                        for (let val = 1; val <= 9; val++) {
                            if (this.isValid(grid, r, c, val)) candidates++;
                        }
                        if (candidates < minCandidates) {
                            minCandidates = candidates;
                            row = r;
                            col = c;
                        }
                    }
                }
            }
            
            if (row === -1) {
                solutionsCount++;
                return;
            }
            
            for (let val = 1; val <= 9; val++) {
                if (this.isValid(grid, row, col, val)) {
                    grid[row][col] = val;
                    solve(grid);
                    grid[row][col] = 0;
                }
            }
        };
        
        const gridCopy = tempBoard.map(row => [...row]);
        solve(gridCopy);
        return solutionsCount;
    }

    isLogicallySolvable(board) {
        const grid = board.map(row => [...row]);
        let changed = true;
        
        while (changed) {
            changed = false;
            
            // 1. Naked Singles 검사 (특정 칸에 들어갈 숫자가 단 하나인 경우)
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (grid[r][c] === 0) {
                        let validNums = [];
                        for (let num = 1; num <= 9; num++) {
                            if (this.isValid(grid, r, c, num)) validNums.push(num);
                        }
                        if (validNums.length === 1) {
                            grid[r][c] = validNums[0];
                            changed = true;
                        }
                    }
                }
            }
            if (changed) continue;
            
            // 2. Hidden Singles 검사 (행/열/박스 내에서 특정 숫자가 들어갈 수 있는 유일한 칸 찾기)
            // 가로줄 검사
            for (let r = 0; r < 9; r++) {
                for (let num = 1; num <= 9; num++) {
                    let possibleCols = [];
                    for (let c = 0; c < 9; c++) {
                        if (grid[r][c] === 0 && this.isValid(grid, r, c, num)) possibleCols.push(c);
                    }
                    if (possibleCols.length === 1) {
                        grid[r][possibleCols[0]] = num;
                        changed = true;
                    }
                }
            }
            if (changed) continue;
            
            // 세로줄 검사
            for (let c = 0; c < 9; c++) {
                for (let num = 1; num <= 9; num++) {
                    let possibleRows = [];
                    for (let r = 0; r < 9; r++) {
                        if (grid[r][c] === 0 && this.isValid(grid, r, c, num)) possibleRows.push(r);
                    }
                    if (possibleRows.length === 1) {
                        grid[possibleRows[0]][c] = num;
                        changed = true;
                    }
                }
            }
            if (changed) continue;
            
            // 3x3 박스 검사
            for (let b = 0; b < 9; b++) {
                let startRow = Math.floor(b / 3) * 3;
                let startCol = (b % 3) * 3;
                for (let num = 1; num <= 9; num++) {
                    let possibleCells = [];
                    for (let r = 0; r < 3; r++) {
                        for (let c = 0; c < 3; c++) {
                            let currR = startRow + r;
                            let currC = startCol + c;
                            if (grid[currR][currC] === 0 && this.isValid(grid, currR, currC, num)) {
                                possibleCells.push({ r: currR, c: currC });
                            }
                        }
                    }
                    if (possibleCells.length === 1) {
                        grid[possibleCells[0].r][possibleCells[0].c] = num;
                        changed = true;
                    }
                }
            }
        }
        
        // 빈칸이 하나도 안 남고 풀렸는지 확인
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (grid[r][c] === 0) return false;
            }
        }
        return true;
    }

    removeNumbersSymmetric(difficulty) {
        let targetEmptyCells;
        switch (difficulty) {
            case 'easy': targetEmptyCells = 32; break; // 약 49개 단서 노출
            case 'medium': targetEmptyCells = 44; break; // 약 37개 단서 노출
            case 'hard': targetEmptyCells = 52; break; // 약 29개 단서 노출
            default: targetEmptyCells = 44;
        }

        this.initialBoard = this.board.map(row => [...row]);
        
        // 전체 81개 셀 좌표 리스트 생성
        let cellCoords = [];
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                cellCoords.push({ r, c });
            }
        }
        this.shuffle(cellCoords);

        let emptyCount = 0;
        
        // 셔플된 셀 리스트를 돌며 대칭적으로 빈칸 뚫기 시작
        for (let coord of cellCoords) {
            if (emptyCount >= targetEmptyCells) break;

            const r = coord.r;
            const c = coord.c;
            const symR = 8 - r;
            const symC = 8 - c;

            // 이미 비워진 경우 스킵
            if (this.initialBoard[r][c] === 0) continue;

            const valBackup = this.initialBoard[r][c];
            const symValBackup = this.initialBoard[symR][symC];

            // 대칭 쌍 임시 제거
            this.initialBoard[r][c] = 0;
            this.initialBoard[symR][symC] = 0;

            let isRemovalValid = false;

            // 난이도에 따라 검증 강도 설정
            // Hard의 경우 좀 더 복잡한 기법이 필요할 수 있으므로 Unique Solution 여부만 체크하고,
            // Easy와 Medium은 찍기 없이 풀리도록 논리적 솔버 검증을 함께 거칩니다.
            if (difficulty === 'hard') {
                isRemovalValid = (this.countSolutions(this.initialBoard) === 1);
            } else {
                isRemovalValid = this.isLogicallySolvable(this.initialBoard);
            }

            if (isRemovalValid) {
                emptyCount += (r === symR && c === symC) ? 1 : 2;
            } else {
                // 실패 시 원상복구
                this.initialBoard[r][c] = valBackup;
                this.initialBoard[symR][symC] = symValBackup;
            }
        }
        
        this.board = this.initialBoard.map(row => [...row]);
    }

    removeNumbersOriginal(difficulty) {
        let attempts;
        switch (difficulty) {
            case 'easy': attempts = 30; break;
            case 'medium': attempts = 45; break;
            case 'hard': attempts = 55; break;
            default: attempts = 45;
        }

        this.initialBoard = this.board.map(row => [...row]);
        let count = attempts;
        while (count > 0) {
            let r = Math.floor(Math.random() * 9);
            let c = Math.floor(Math.random() * 9);
            if (this.initialBoard[r][c] !== 0) {
                this.initialBoard[r][c] = 0;
                count--;
            }
        }
        this.board = this.initialBoard.map(row => [...row]);
    }

    renderBoard() {
        this.cells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            this.renderCell(cell, r, c);
        });
        this.updateNumpadStatus();
    }

    updateNumpadStatus() {
        const counts = Array(10).fill(0);
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const val = this.board[r][c];
                if (val >= 1 && val <= 9) {
                    counts[val]++;
                }
            }
        }
        document.querySelectorAll('.numpad-btn').forEach(btn => {
            const valAttr = btn.dataset.number;
            if (valAttr && valAttr !== 'erase') {
                const numVal = parseInt(valAttr);
                if (numVal >= 1 && numVal <= 9) {
                    if (counts[numVal] >= 9) {
                        btn.classList.add('completed-disabled');
                    } else {
                        btn.classList.remove('completed-disabled');
                    }
                }
            }
        });
    }

    renderCell(cell, r, c) {
        const val = this.board[r][c];
        const memoSet = this.memos[r][c];

        cell.innerHTML = '';
        cell.className = 'cell';
        
        if (this.initialBoard[r][c] !== 0) {
            cell.textContent = val;
            cell.classList.add('fixed');
        } else if (val !== 0) {
            cell.textContent = val;
            cell.classList.add('user-input');
        } else if (memoSet.size > 0) {
            const memoGrid = document.createElement('div');
            memoGrid.classList.add('memo-grid');
            for (let i = 1; i <= 9; i++) {
                const item = document.createElement('div');
                item.classList.add('memo-item');
                item.textContent = memoSet.has(i) ? i : '';
                memoGrid.appendChild(item);
            }
            cell.appendChild(memoGrid);
        }

        if (r === this.selectedCell.row && c === this.selectedCell.col) {
            cell.classList.add('selected');
        } else if (r === this.selectedCell.row || c === this.selectedCell.col || 
            (Math.floor(r / 3) === Math.floor(this.selectedCell.row / 3) && Math.floor(c / 3) === Math.floor(this.selectedCell.col / 3))) {
            cell.classList.add('related');
        }
    }

    selectCell(row, col) {
        this.selectedCell = { row, col };
        const selectedNum = this.board[row][col]; 

        this.cells.forEach(cell => {
            const r = parseInt(cell.dataset.row);
            const c = parseInt(cell.dataset.col);
            
            this.renderCell(cell, r, c);
            
            if (selectedNum !== 0 && this.board[r][c] === selectedNum) {
                if (!(r === row && c === col)) {
                    cell.classList.add('same-number');
                }
            }
        });
    }

    inputNumber(num) {
        if (this.isGameOver) return;
        const { row, col } = this.selectedCell;
        if (row === -1 || this.initialBoard[row][col] !== 0) return;

        // ◀ 현재 변경 전의 상태를 기록 객체로 깊은 복사하여 생성
        const prevStatus = {
            row: row,
            col: col,
            val: this.board[row][col],
            memos: new Set(this.memos[row][col]),
            affectedMemos: [] // ◀ 자동 정리로 영향받을 주변 메모 정보 기록용
        };

        let isChanged = false;

        if (num === 0) {
            if (this.board[row][col] !== 0 || this.memos[row][col].size > 0) {
                this.board[row][col] = 0;
                this.memos[row][col].clear();
                isChanged = true;
            }
        } else if (this.isMemoMode) {
            this.board[row][col] = 0;
            if (this.memos[row][col].has(num)) {
                this.memos[row][col].delete(num);
            } else {
                this.memos[row][col].add(num);
            }
            isChanged = true;
        } else {
            if (this.board[row][col] !== num) {
                this.board[row][col] = num;
                this.memos[row][col].clear();
                isChanged = true;

                // 💡 진짜 숫자 입력 시 가로, 세로, 3x3 박스의 메모 자동 삭제 로직 추가
                const startRow = row - row % 3;
                const startCol = col - col % 3;
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        // 자기 자신은 스킵
                        if (r === row && c === col) continue;

                        const isSameRow = (r === row);
                        const isSameCol = (c === col);
                        const isSameBlock = (r >= startRow && r < startRow + 3 && c >= startCol && c < startCol + 3);

                        if (isSameRow || isSameCol || isSameBlock) {
                            if (this.memos[r][c].has(num)) {
                                prevStatus.affectedMemos.push({
                                    row: r,
                                    col: c,
                                    memos: new Set(this.memos[r][c]) // 이전 메모 깊은 복사
                                });
                                this.memos[r][c].delete(num);
                            }
                        }
                    }
                }
            }
        }

        // 기록 저장
        if (isChanged) {
            this.history.push(prevStatus);
            this.saveGameState(); // ◀ 실시간 상태 로컬 스토리지 저장
        }

        this.renderBoard();
        this.checkErrors();
        if (this.checkWin()) {
            this.handleWin();
        }
    }

    undo() {
        if (this.isGameOver || this.history.length === 0) return;

        // 가장 마지막에 저장된 행동 기록을 추출
        const lastAction = this.history.pop();
        const { row, col, val, memos, affectedMemos } = lastAction;

        // 이전 상태로 데이터 원복
        this.board[row][col] = val;
        this.memos[row][col] = memos;

        // 자동 정리되었던 주변 메모들 복원
        if (affectedMemos && affectedMemos.length > 0) {
            for (const affected of affectedMemos) {
                this.memos[affected.row][affected.col] = affected.memos;
            }
        }

        // 셀 선택 위치를 되돌린 곳으로 이동
        this.selectedCell = { row, col };

        // 화면 다시 그리기 및 에러 체크
        this.renderBoard();
        this.selectCell(row, col); // 하이라이트 동기화를 위해 selectCell 다시 호출
        this.checkErrors();
        this.saveGameState(); // ◀ 되돌리기 수행 후 상태 로컬 저장 동기화
    }

    handleNumpadInput(num, forceMemoMode) {
        const originalMemoMode = this.isMemoMode;
        this.isMemoMode = forceMemoMode;
        this.inputNumber(num);
        this.isMemoMode = originalMemoMode;
    }

    checkErrors() {
        this.cells.forEach(cell => cell.classList.remove('error'));
        
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const val = this.board[r][c];
                if (val === 0) continue;

                let isError = false;
                for (let i = 0; i < 9; i++) {
                    if (i !== c && this.board[r][i] === val) isError = true;
                    if (i !== r && this.board[i][c] === val) isError = true;
                }
                let startRow = r - r % 3;
                let startCol = c - c % 3;
                for (let i = 0; i < 3; i++) {
                    for (let j = 0; j < 3; j++) {
                        let currR = i + startRow;
                        let currC = j + startCol;
                        if ((currR !== r || currC !== c) && this.board[currR][currC] === val) isError = true;
                    }
                }

                if (isError) {
                    const cell = Array.from(this.cells).find(cell => parseInt(cell.dataset.row) === r && parseInt(cell.dataset.col) === c);
                    if (cell) cell.classList.add('error');
                }
            }
        }
    }

    checkWin() {
        // 1. 모든 칸이 채워졌는지 확인 (빈칸인 0이 없어야 함)
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (this.board[r][c] === 0) {
                    return false;
                }
            }
        }

        // 2. 가로줄 중복 검사
        for (let r = 0; r < 9; r++) {
            const rowSet = new Set();
            for (let c = 0; c < 9; c++) {
                const val = this.board[r][c];
                if (rowSet.has(val)) return false;
                rowSet.add(val);
            }
        }

        // 3. 세로줄 중복 검사
        for (let c = 0; c < 9; c++) {
            const colSet = new Set();
            for (let r = 0; r < 9; r++) {
                const val = this.board[r][c];
                if (colSet.has(val)) return false;
                colSet.add(val);
            }
        }

        // 4. 3x3 서브 그리드 블록 중복 검사
        for (let blockRow = 0; blockRow < 3; blockRow++) {
            for (let blockCol = 0; blockCol < 3; blockCol++) {
                const blockSet = new Set();
                const startRow = blockRow * 3;
                const startCol = blockCol * 3;
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        const val = this.board[startRow + r][startCol + c];
                        if (blockSet.has(val)) return false;
                        blockSet.add(val);
                    }
                }
            }
        }

        return true;
    }

    handleWin() {
        this.isGameOver = true;
        clearInterval(this.timerInterval);
        
        // 시간 포맷 생성
        const mins = Math.floor(this.timer / 60).toString().padStart(2, '0');
        const secs = (this.timer % 60).toString().padStart(2, '0');
        if (this.winTimeDisplay) {
            this.winTimeDisplay.textContent = `소요 시간: ${mins}:${secs}`;
        }
        
        if (this.winModal) {
            this.winModal.style.display = 'flex';
        }

        this.messageElement.textContent = '🎉 축하합니다! 스도쿠를 해결했습니다!';
        this.messageElement.style.color = '#10b981';
        this.clearSavedState(); // ◀ 게임 클리어 시 자동 저장된 정보 비우기
    }

    handleArrowKey(key) {
        let { row, col } = this.selectedCell;
        if (key === 'ArrowUp') row = (row - 1 + 9) % 9;
        else if (key === 'ArrowDown') row = (row + 1) % 9;
        else if (key === 'ArrowLeft') col = (col - 1 + 9) % 9;
        else if (key === 'ArrowRight') col = (col + 1) % 9;
        this.selectCell(row, col);
    }

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('sudoku-theme', newTheme);
        this.updateThemeButton(newTheme);
    }

    updateThemeButton(theme) {
        if (this.themeToggleBtn) {
            this.themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            this.timer++;
            const mins = Math.floor(this.timer / 60).toString().padStart(2, '0');
            const secs = (this.timer % 60).toString().padStart(2, '0');
            this.timerElement.textContent = `시간: ${mins}:${secs}`;
        }, 1000);
    }

    resetTimer() {
        clearInterval(this.timerInterval);
        this.timer = 0;
        this.timerElement.textContent = '시간: 00:00';
    }

    // --- ◀ 자동 저장 및 복구 기능 헬퍼 메소드 추가 ---
    saveGameState() {
        if (this.isGameOver) {
            this.clearSavedState();
            return;
        }

        // Set 형태의 메모 데이터는 JSON으로 바로 저장할 수 없으므로 배열화 직렬화
        const serializedMemos = this.memos.map(row => 
            row.map(cellSet => Array.from(cellSet))
        );

        // 실행 취소 스택 내의 Set 형태 메모도 함께 직렬화
        const serializedHistory = this.history.map(action => ({
            row: action.row,
            col: action.col,
            val: action.val,
            memos: Array.from(action.memos),
            affectedMemos: action.affectedMemos ? action.affectedMemos.map(a => ({
                row: a.row,
                col: a.col,
                memos: Array.from(a.memos)
            })) : []
        }));

        const state = {
            board: this.board,
            solution: this.solution,
            initialBoard: this.initialBoard,
            memos: serializedMemos,
            timer: this.timer,
            difficulty: this.difficultySelect.value,
            useNewAlgorithm: this.useNewAlgorithm, // ◀ 생성 알고리즘 종류 저장
            history: serializedHistory,
            isGameOver: this.isGameOver,
            selectedCell: this.selectedCell
        };

        localStorage.setItem('sudoku-save-state', JSON.stringify(state));
    }

    loadGameState() {
        try {
            const raw = localStorage.getItem('sudoku-save-state');
            if (!raw) return false;
            const state = JSON.parse(raw);

            this.board = state.board;
            this.solution = state.solution;
            this.initialBoard = state.initialBoard;
            this.timer = state.timer;
            this.isGameOver = state.isGameOver;
            this.selectedCell = state.selectedCell || { row: 0, col: 0 };
            
            // 생성 알고리즘 복구 및 UI 반영
            this.useNewAlgorithm = state.useNewAlgorithm !== undefined ? state.useNewAlgorithm : false;
            this.updateAlgoDisplay();

            // 배열 형태 메모를 다시 Set 객체로 복원
            this.memos = state.memos.map(row =>
                row.map(cellArr => new Set(cellArr))
            );

            // 되돌리기 기록 복원
            this.history = state.history.map(action => ({
                row: action.row,
                col: action.col,
                val: action.val,
                memos: new Set(action.memos),
                affectedMemos: action.affectedMemos ? action.affectedMemos.map(a => ({
                    row: a.row,
                    col: a.col,
                    memos: new Set(a.memos)
                })) : []
            }));

            // 난이도 드롭다운 싱크
            if (state.difficulty) {
                this.difficultySelect.value = state.difficulty;
                const difficultyText = this.difficultySelect.options[this.difficultySelect.selectedIndex].text;
                this.difficultyDisplay.textContent = `난이도: ${difficultyText}`;
            }

            this.isGameOver = false;
            this.messageElement.textContent = '';
            this.messageElement.style.color = '';
            this.renderBoard();

            // 타이머 재가동
            clearInterval(this.timerInterval);
            this.startTimer();
            
            // 기존 선택 영역 하이라이트 동기화
            this.selectCell(this.selectedCell.row, this.selectedCell.col);

            return true;
        } catch (e) {
            console.error("Error loading saved Sudoku state:", e);
            this.clearSavedState();
            return false;
        }
    }

    clearSavedState() {
        localStorage.removeItem('sudoku-save-state');
    }

    hasUserMoves() {
        if (this.history && this.history.length > 0) return true;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (this.initialBoard[r][c] === 0 && (this.board[r][c] !== 0 || this.memos[r][c].size > 0)) {
                    return true;
                }
            }
        }
        return false;
    }

    checkAndRestoreGame() {
        const raw = localStorage.getItem('sudoku-save-state');
        if (raw) {
            try {
                const state = JSON.parse(raw);
                // 게임이 끝나지 않았고 실질적 액션이 누적된 세션인 경우 복구 모달 열기
                if (state && !state.isGameOver && (state.history.length > 0 || this.hasSavedMoves(state))) {
                    this.restoreModal.style.display = 'flex';
                    return;
                }
            } catch (e) {
                console.error("Error parsing save state:", e);
                this.clearSavedState();
            }
        }
        // 복구할 세션이 없다면 바로 신규 게임 가동
        this.startNewGame();
    }

    hasSavedMoves(state) {
        if (!state || !state.board || !state.initialBoard) return false;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (state.initialBoard[r][c] === 0) {
                    if (state.board[r][c] !== 0) return true;
                    if (state.memos && state.memos[r] && state.memos[r][c] && state.memos[r][c].length > 0) return true;
                }
            }
        }
        return false;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new SudokuGame();
});