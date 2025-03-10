Site.ready({ type: 'simulator' }, function (urlParams) {
    $('[data-op="report"]').click(() => Dialog.open(ReportDialog, 'guilds'))

    SimulatorUtils.configure({
        params: urlParams,
        onLog: (callback) => {
            executeSimulation(1, 50, callback);
        }
    });
    
    function validateLists () {
        return playerList[0].length > 0 && playerList[1].length > 0;
    }

    // Handle simulate button validation
    let $simulateButton = $('#simulate');
    function updateSimulateButton () {
        if (validateLists()) {
            $simulateButton.removeClass('disabled');
        } else {
            $simulateButton.addClass('disabled');
        }
    }

    // Handle save button
    let $saveButton = $('#save-player');
    function updateSaveButton () {
        $saveButton.toggle(playerCurrentIndex != -1)
    }

    // List of players
    let playerList = [[], []];
    let playerIndex = 0;

    // Tracks currently selected player
    let playerCurrentIndex = -1;
    updateSaveButton();

    // Editor configuration
    Editor.createPlayerEditor('#player-editor');
    Editor.createPasteTarget();

    const editor = new Editor('#player-editor');

    let currentList = 0;
    $('[data-guild]').click(({ currentTarget }) => {
        currentList = parseInt(currentTarget.dataset.guild);

        document.querySelector(`[data-guild]:not([data-guild="${currentList}"])`).classList.remove('active-guild');
        currentTarget.classList.add('active-guild');

        editor.clear();
        playerCurrentIndex = -1;

        updateSaveButton();
        updatePlayerList();
    }).first().click();

    // Captive inputs
    DOM.input({
        element: DOM.byID('sim-threads'),
        key: 'guild_sim/threads',
        def: 4,
        validator: (value)=> !isNaN(value) && value >= 1
    })

    DOM.input({
        element: DOM.byID('sim-iterations'),
        key: 'guild_sim/iterations',
        def: 2500,
        validator: (value)=> !isNaN(value) && value >= 1
    })

    // Prevent paste inside inputs from trying to load data
    $('#player-editor input').on('paste', function (event) {
        event.stopPropagation();
    });

    // Paste mode toggle button
    let pasteMode = false;
    DOM.toggle({
        element: DOM.byID('paste-mode'),
        callback: (active) => {
            pasteMode = active;
        }
    })

    // Gladiator mode toggle button
    let gladiatorMode = false;
    DOM.toggle({
        element: DOM.byID('gladiator-mode'),
        key: 'guild_sim/gladiator',
        callback: (active) => {
            gladiatorMode = active;
        }
    });

    function getSimulatorFlags () {
        return {
            Gladiator15: gladiatorMode
        };
    }

    // Paste handler
    $(document.body).on('paste', function (event) {
        try {
            let pasteData = event.originalEvent.clipboardData.getData('text');
            let pasteJson = JSON.parse(pasteData);

            handlePaste(pasteJson);
        } catch (e) {
            console.info(e);
        }
    }).on('dragover dragenter', function (event) {
        event.preventDefault();
        event.stopPropagation();
    }).on('drop', async function (event) {
        // Handle drag & drop in case we want to paste data via preset file
        let contentType = _dig(event, 'originalEvent', 'dataTransfer', 'files', 0, 'type');
        if (contentType == 'text/plain' || contentType == '') {
            event.preventDefault();
            event.stopPropagation();

            try {
                let pasteData = await event.originalEvent.dataTransfer.files[0].text();
                let pasteJson = JSON.parse(pasteData);
                let pasteImpl = contentType == 'text/plain' ? pasteJson : PlayaResponse.importData(pasteJson).players;

                handlePaste(pasteImpl);
            } catch (e) {
                console.info(e);
            }
        }
    });

    // Paste handler
    function preparePlayerData (data) {
        let object = data.Class ? data : new PlayerModel(data);

        ItemModel.forceCorrectRune(object.Items.Wpn1);
        ItemModel.forceCorrectRune(object.Items.Wpn2);

        if (object.Class == WARRIOR && typeof object.BlockChance == 'undefined') {
            object.BlockChance = object.Items.Wpn2.DamageMin;
        }

        if (object.Class != ASSASSIN) {
            object.Items.Wpn2 = ItemModel.empty();
        }

        return object;
    }

    function handlePaste (data) {
        if (Array.isArray(data)) {
            if (pasteMode == false) {
                playerList[currentList] = [];

                editor.clear();

                playerCurrentIndex = -1;
                updateSaveButton();
            }

            for (let entry of data) {
                playerList[currentList].push({
                    player: _merge(new PlayerModel(), preparePlayerData(entry)),
                    inactive: 0,
                    index: playerIndex++
                })
            }

            updatePlayerList();
        } else if (data.Class || data.save) {
            editor.fill(preparePlayerData(data));
        }
    }

    $('#copy-all').click(function () {
        copyJSON(playerList[currentList].map((p) => ModelUtils.toSimulatorData(p.player)));
    })

    // Add methods
    function addPlayer () {
        let player = editor.read();
        if (player.Name == '') {
            player.Name = `Player ${playerList[currentList].length + 1}`;
        }

        playerList[currentList].unshift({
            player: player,
            inactive: 0,
            index: playerIndex++
        })

        playerCurrentIndex = -1;
        updateSaveButton();

        editor.clear();
    }

    $('#add-player').click(function () {
        if (editor.valid()) {
            addPlayer();
            updatePlayerList();
        }
    })

    // Save methods
    $saveButton.click(function () {
        if (editor.valid()) {
            if (playerCurrentIndex != -1) {
                let index = playerList[currentList].findIndex(entry => entry.index == playerCurrentIndex);
                if (index != -1) {
                    playerList[currentList][index].player = editor.read()
                }
            } else {
                addPlayer();
            }

            updatePlayerList();
        }
    })

    // Display methods
    function updatePlayerList () {
        updateSimulateButton();

        _sortDesc(playerList[currentList], entry => entry.player.Level);

        let content = ''
        for (let i = 0; i < playerList[currentList].length; i++) {
            let {player, index, inactive} = playerList[currentList][i];

            content += `
                <div class="text-white row selectable ${ index == playerCurrentIndex ? 'selected' : 'nselected' } ${ inactive > 0 ? 'opacity-50' : '' }" data-index="${ index }">
                    <div class="player-index">${ i + 1 }</div>
                    <div class="three wide text-center column">
                        <img class="ui medium centered image" style="width: 50px;" src="${_classImageUrl(player.Class)}">
                    </div>
                    <div class="two wide column">
                        <b>${ player.Level }</b>
                    </div>
                    <div class="nine wide column">
                        <b>${ player.Name }${ inactive == 2 ? ' (Inactive 14+ days)' : (inactive == 1 ? ' (Inactive)' : '') }</b>
                    </div>
                    <div class="one wide text-center column">
                        <i class="calendar times outline right aligned cursor-pointer !text-darkgreen:hover icon" data-inactive="${ index }"></i>
                    </div>
                    <div class="one wide text-center column">
                        <i class="trash right aligned alternate cursor-pointer !text-red:hover outline icon" data-trash="${ index }"></i>
                    </div>
                </div>
            `;
        }

        $('#sim-players').html(content);

        $('[data-index]').click(function () {
            playerCurrentIndex = parseInt(this.dataset.index);
            updateSaveButton();

            editor.fill(playerList[currentList].find(entry => entry.index == playerCurrentIndex).player);

            updatePlayerList();
        })

        $('[data-inactive]').click(function () {
            let index = parseInt(this.dataset.inactive);

            let listIndex = playerList[currentList].findIndex(entry => entry.index == index);
            if (listIndex != -1) {
                playerList[currentList][listIndex].inactive = ++playerList[currentList][listIndex].inactive % 3;
            }

            updatePlayerList();

            return false;
        }).contextmenu(function () {
            let index = parseInt(this.dataset.inactive);

            let listIndex = playerList[currentList].findIndex(entry => entry.index == index);
            if (listIndex != -1) {
                playerList[currentList][listIndex].inactive = 0;
            }

            updatePlayerList();

            return false;
        })

        $('[data-trash]').click(function () {
            let index = parseInt(this.dataset.trash);
            if (index == playerCurrentIndex) {
                editor.clear();

                playerCurrentIndex = -1;
                updateSaveButton();
            }

            let listIndex = playerList[currentList].findIndex(entry => entry.index == index);
            if (listIndex != -1) {
                playerList[currentList].splice(listIndex, 1);
            }

            updatePlayerList();

            return false;
        });
    }

    function displayResults (results, iterations) {
        let score = 100 * _mappedSum(results, r => r.score) / iterations;

        $('div.row.results').html(`
            <div class="sixteen wide column" style="display: flex; flex-direction: row; align-items: center; justify-content: center;">
                <div style="flex: 1 1 50%; margin: 0.5em;">
                    <h3 class="ui centered inverted header" style="margin-top: 0em;">
                        <span>${score.toFixed(2)}%</span>
                    </h3>
                </div>
                <div style="flex: 1 1 50%; margin: 0.5em;">
                    <h3 class="ui centered inverted header" style="margin-top: 0em;">
                        <span>${(100 - score).toFixed(2)}%</span>
                    </h3>
                </div>
            </div>
        `).show();
    }

    StatisticsIntegration.configure({
        profile: HYDRA_PROFILE,
        type: 'guilds',
        scope: (dm) => _compact(Object.values(dm.Groups).map(g => g.List.filter(gi => gi.MembersTotal == gi.MembersPresent)[0])),
        callback: (group) => {
            editor.clear();
            playerCurrentIndex = -1;
            updateSaveButton();

            playerList[currentList] = group.Members.map(memberId => {
                return {
                    player: ModelUtils.toSimulatorData(DatabaseManager.getPlayer(memberId, group.Timestamp)),
                    inactive: 0,
                    index: playerIndex++
                };
            })

            updatePlayerList();
        }
    });

    $('#simulate').click(function () {
        const instances = Math.max(1, Number($('#sim-threads').val()) || 4);
        const iterations = Math.max(1, Number($('#sim-iterations').val()) || 2500);

        executeSimulation(instances, iterations);
    })

    function executeSimulation (instances, iterations, logCallback) {
        if (validateLists()) {
            const results = [];
            let logs = [];

            const batch = new WorkerBatch('guilds');

            for (let i = 0; i < instances; i++) {
                batch.add(
                    ({ results: _results, logs: _logs }, time) => {
                        results.push(_results);

                        Toast.info(intl('guilds.toast.end.title', { done: results.length, total: instances }), intl('guilds.toast.end.message#', { time: time / 1000 }))

                        if (logCallback) {
                            logs = logs.concat(_logs);
                        }
                    },
                    {
                        flags: getSimulatorFlags(),
                        guildA: playerList[0],
                        guildB: playerList[1],
                        iterations,
                        config: SimulatorUtils.config,
                        log: !!logCallback,
                    }
                )
            }

            batch.run(instances).then((duration) => {
                Toast.info(intl('simulator.toast.title'), intl('simulator.toast.message', { duration: _formatDuration(duration) }));
                
                displayResults(results, instances * iterations);

                if (logs.length > 0) {
                    logCallback({
                        fights: logs,
                        players: playerList.flatMap((list) => list.map(({ player }) => player)),
                        config: SimulatorUtils.config
                    });
                }
            });
        }
    }
});