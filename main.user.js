// ==UserScript==
// @name         BadGuessr Map Util
// @namespace    https://github.com/hunterbdm/BadGuessr
// @version      1.1.1
// @description  Collect your worst guesses from the activities page and export them for map creation.
// @author       hunterbdm
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        none
// @downloadURL  https://github.com/hunterbdm/BadGuessr/raw/master/main.user.js
// @updateURL    https://github.com/hunterbdm/BadGuessr/raw/master/main.meta.js
// ==/UserScript==

let config = {
    badGuessDistanceKMs: 1000,
    badGuessPoints: 2500,
    afterTime: new Date(),
    beforeTime: new Date()
}
config.afterTime.setFullYear(config.afterTime.getFullYear() - 1)
config.beforeTime.setDate(config.beforeTime.getDate() + 1)

const sleep = ms => new Promise(r => setTimeout(r, ms));
let currentTab = ""
let duelsTypes = {
    moving: [],
    noMove: [],
    nmpz: []
}
let classic = []
let battleRoyale = []

let duels = {}
let classicGames = {}
let brGames = {}

let maps = {}

const ENDPOINTS = {
    DUELS_GUESS: "Duels",
    BR_DISTANCE_GUESS: "BattleRoyaleDistance",
    CLASSIC_GUESS: "Standard",
    NOMINATIM_REVERSE: "https://nominatim.openstreetmap.org/reverse",
};

const CONFIG = {
    /* SUPABASE_URL, SUPABASE_KEY and GEOGUESSR_PLAYER_ID must be replaced with actual, valid values. */
    SUPABASE_URL: "https://xmecafiuktnendzhgcse.supabase.co",
    SUPABASE_KEY:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZWNhZml1a3RuZW5kemhnY3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3NzQzNzksImV4cCI6MjA2MzM1MDM3OX0.VZsHF-ixtrWfsPX2hx9jQRzMM-h_gkH4sKmGI4-LaRY",
    GEOGUESSR_PLAYER_ID: "6637ba34887ce844a15d10ef",
    USER_AGENT: "GeoStats-Userscript/0.1",
  };

// Helpers
function downloadJSON(data, filename) {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'BadGuessr-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
function disableButton(btn, newText) {
    // add button_disabled__rTguF
    btn.disabled = true
    btn.className = "button_button__aR6_e button_variantTertiary__y_oa3 button_disabled__rTguF"
    if (newText != undefined) {
        btn.innerText = newText
    }
}
function enableButton(btn, newText) {
    btn.disabled = false
    btn.className = "button_button__aR6_e button_variantTertiary__y_oa3"
    if (newText != undefined) {
        btn.innerText = newText
    }
}
async function getJson(url) {
  try {
    const response = await fetch(url, {
        credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}
async function fetchLocation(lat, lng) {
    if (typeof lat !== "number" || typeof lng !== "number") {
        return {
        display_name: null,
        city: null,
        state: null,
        country: null,
        };
    }

    const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lng.toString(),
        format: "json",
        "accept-language": "en",
    });

    try {
        const response = await fetch(`${ENDPOINTS.NOMINATIM_REVERSE}?${params}`, {
        headers: { "User-Agent": CONFIG.USER_AGENT },
        });

        if (!response.ok) {
        return {
            display_name: null,
            city: null,
            state: null,
            country: null,
        };
        }

        const data = await response.json();
        const address = data.address || {};
        const city = address.city || address.town || address.village || null;
        const state = address.state || address.region || address.province || null;
        const country = address.country || null;

        return {
        display_name: data.display_name || null,
        city,
        state,
        country,
        };
    } catch {
        return {
        display_name: null,
        city: null,
        state: null,
        country: null,
        };
    }
}
async function sendToSupabase(guess) {
    if (!guess) {
        return;
    }

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/guesses`, {
        method: "POST",
        headers: {
            apikey: CONFIG.SUPABASE_KEY,
            Authorization: `Bearer ${CONFIG.SUPABASE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
        },
        body: JSON.stringify(guess),
        });

        if (response.status !== 201) {
        console.error(
            `[GeoStats] Failed to save to Supabase: ${response.status}`
        );
        }
    } catch (error) {
        console.error(`[GeoStats] Failed to save to Supabase: ${error.message}`);
    }
}

// UI Drawing & Updating
function drawUI() {
    function createCoinCard(title, amount, id) {
        const navCard = document.createElement('div');
        navCard.className = 'nav-card_tag__vQEsd coin-shop_card__gr4rX coin-shop_coinPack__74nQg';

        navCard.innerHTML = `
        <div class="game-options_optionInput__paPBZ"><input id="${id}-include" type="checkbox" class="toggle_toggle__qfXpL" checked=""></div>
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">${title}</label>
        <label id="${id}-counter" class="label_label__9xkbh shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-30); --lh: var(--line-height-30);">${amount}</label>`;

        return navCard;
    }
    function createSubToggle(title, id) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'game-options_optionInput__paPBZ';
        toggleDiv.style = 'margin-left: 20px; display: flex; align-items: center;';
        
        toggleDiv.innerHTML = `
        <input id="${id}" type="checkbox" class="toggle_toggle__qfXpL" checked="">
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-14); --lh: var(--line-height-14); margin-left: 5px;">${title}</label>`;
        
        return toggleDiv;
    }
    function createButton(id, text, onclick) {
        var btn = document.createElement('button')
        btn.id = id
        btn.innerText = text
        btn.onclick = onclick
        btn.className = "button_button__aR6_e button_variantTertiary__y_oa3"
        return btn
    }

    let baseDiv = document.createElement('div')
    baseDiv.id = "BadGuessr-frame"
    baseDiv.className = "BadGuessr"

    let configContainer = document.createElement("div")
    configContainer.style = "display: grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom: 10px;"
    configContainer.innerHTML = `
    <div> 
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">Distance(kms) &gt;=</label>
        <input id="BadGuessr-badDistance" type="number" name="content-creator-code" class="text-input_textInput__KCdAH text-input_variantDark__cuoXe" value="1000" placeholder="1000" maxlength="50" autocomplete="on" value="">
    </div>
    <div> 
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">Points &lt;=</label>
        <input id="BadGuessr-badScore" type="number" name="content-creator-code" class="text-input_textInput__KCdAH text-input_variantDark__cuoXe" value="2500" "placeholder="1000" maxlength="50" autocomplete="on" value="">
    </div>
    `
    baseDiv.appendChild(configContainer)

    let dateContainer = document.createElement("div")
    dateContainer.style = "display: grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom: 10px;"
    dateContainer.innerHTML = `
    <div> 
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">After date</label>
        <input id="BadGuessr-afterDate" type="date" name="content-creator-code" class="text-input_textInput__KCdAH text-input_variantDark__cuoXe" value="${config.afterTime.toLocaleDateString('en-CA')}" "placeholder="1000" maxlength="50" autocomplete="on" value="">
    </div>
    <div> 
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">Before date</label>
        <input id="BadGuessr-beforeDate" type="date" name="content-creator-code" class="text-input_textInput__KCdAH text-input_variantDark__cuoXe" value="${config.beforeTime.toLocaleDateString('en-CA')}" "placeholder="1000" maxlength="50" autocomplete="on" value="">
    </div>
    `
    baseDiv.appendChild(dateContainer)

    let buttonsContainer = document.createElement("div")
    buttonsContainer.style = "display: grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-bottom: 10px;"
    buttonsContainer.appendChild(createButton("BadGuessr-loadAllActivity", "Load Activity", loadAllActivity))
    buttonsContainer.appendChild(createButton("BadGuessr-loadGameData", "Load Game Data", loadGameDetails))
    buttonsContainer.appendChild(createButton("BadGuessr-loadGameLocs", "Load Game Locs", loadGameLocs))
    buttonsContainer.appendChild(createButton("BadGuessr-export", "Export", exportBadGuesses))
    baseDiv.appendChild(buttonsContainer)

    let activityCounters = document.createElement("div")
    activityCounters.id = "BadGuessr-activityCounters"
    activityCounters.style = "display: grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-bottom: 10px;"
    activityCounters.appendChild(createCoinCard("Classic Games", 0, "BadGuessr-classicGame"))

    let duelContainer = document.createElement('div');
    duelContainer.className = 'nav-card_tag__vQEsd coin-shop_card__gr4rX coin-shop_coinPack__74nQg';
    duelContainer.style = "display: flex; flex-direction: column;";

    duelContainer.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <div class="game-options_optionInput__paPBZ"><input id="BadGuessr-duel-include" type="checkbox" class="toggle_toggle__qfXpL" checked=""></div>
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">Duels</label>
        <label id="BadGuessr-duel-counter" class="label_label__9xkbh shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-30); --lh: var(--line-height-30);">0/0</label>
    </div>
    <div id="duel-subtypes-container" style="display: flex; flex-direction: column; margin-top: 8px;"></div>`;
    
    activityCounters.appendChild(duelContainer);
    activityCounters.appendChild(createCoinCard("Battle Royale", 0, "BadGuessr-br"))
    baseDiv.appendChild(activityCounters)

    const duelSubtypesContainer = duelContainer.querySelector('#duel-subtypes-container');
    duelSubtypesContainer.appendChild(createSubToggle("Moving", "BadGuessr-duel-moving"));
    duelSubtypesContainer.appendChild(createSubToggle("No Move", "BadGuessr-duel-nomove"));
    duelSubtypesContainer.appendChild(createSubToggle("NMPZ", "BadGuessr-duel-nmpz"));

    document.querySelector(".activities_switch__s09KS").after(baseDiv)

    updateActivityCounters()

    document.querySelector('#BadGuessr-duel-include').addEventListener('change', function() {
        const isChecked = this.checked;
        document.querySelector('#BadGuessr-duel-moving').checked = isChecked;
        document.querySelector('#BadGuessr-duel-nomove').checked = isChecked;
        document.querySelector('#BadGuessr-duel-nmpz').checked = isChecked;
    });
}
function drawMapSelection() {
    function createMapToggle(mapName, count) {
        let d = document.createElement("div")
        d.style = "display: flex; align-items: center;"
        d.innerHTML = `<input mapname="${mapName}" type="checkbox" class="toggle_toggle__qfXpL" checked="" style="margin-right: 5px;">
        <label class="label_label__9xkbh shared_white60Variant__EC173 shared_boldWeight__U2puG label_italic__LM62Y label_uppercase__DTBcv" style="--fs: var(--font-size-16); --lh: var(--line-height-16);">${mapName} (${count})</label>`

        return d
    }

    try {
        let baseDiv = document.querySelector('#BadGuessr-frame')
        let mapSelectContainer = document.querySelector('#BadGuessr-mapSelectors')
        if (mapSelectContainer == undefined) {
            mapSelectContainer = document.createElement("div")
            mapSelectContainer.id = "BadGuessr-mapSelectors"
            mapSelectContainer.style = "display: grid; text-align: center; margin-bottom: 10px;"
            mapSelectContainer.innerHTML = `<h1 style="--fs:var(--font-size-24);--lh:var(--line-height-24);--xs-fs:var(--font-size-18);--xs-lh:var(--line-height-18);margin-bottom:5px;" class="headline_heading__2lf9L shared_boldWeight__U2puG headline_italic__yzx0R">Select Maps</h1>`
            baseDiv.appendChild(mapSelectContainer)
        }
    
        mapSelectContainer.innerHTML = `<h1 style="--fs:var(--font-size-24);--lh:var(--line-height-24);--xs-fs:var(--font-size-18);--xs-lh:var(--line-height-18)" class="headline_heading__2lf9L shared_boldWeight__U2puG headline_italic__yzx0R">Select Maps</h1>`
    
        // Display maps from most to least played
        const sortedMapNames = Object.keys(maps).sort((a, b) => maps[b] - maps[a]);
        console.log("Sorted values:");
        sortedMapNames.forEach(m => {
            mapSelectContainer.appendChild(createMapToggle(m, maps[m]))
        });
    } catch(e) {
        console.error(e)
    }
}
function updateActivityCounters() {
    try {
        document.querySelector("#BadGuessr-classicGame-counter").innerText = `${Object.keys(classicGames).length}/${classic.length}`

        const totalDuelTypes = duelsTypes.moving.length + duelsTypes.noMove.length + duelsTypes.nmpz.length;
        document.querySelector("#BadGuessr-duel-counter").innerText = `${Object.keys(duels).length}/${totalDuelTypes}`

        document.querySelector("#BadGuessr-br-counter").innerText = `${Object.keys(brGames).length}/${battleRoyale.length}`
    } catch {}
}

// Others
function loadConfig() {
    let badGuessDistanceInput = document.querySelector('#BadGuessr-badDistance')
    if (badGuessDistanceInput != undefined) {
        config.badGuessDistanceKMs = Number(badGuessDistanceInput.value)
    }

    let badGuessPointsInput = document.querySelector('#BadGuessr-badScore')
    if (badGuessPointsInput != undefined) {
        config.badGuessPoints = Number(badGuessPointsInput.value)
    }

    let afterDate = document.querySelector('#BadGuessr-afterDate')
    if (afterDate != undefined) {
        config.afterTime = new Date(afterDate.value)
    }

    let beforeDate = document.querySelector('#BadGuessr-beforeDate')
    if (beforeDate != undefined) {
        config.beforeTime = new Date(beforeDate.value)
    }
}
function isBadGuess(distanceMeters, points) {
    return distanceMeters > config.badGuessDistanceKMs*1000 || points < config.badGuessPoints;
}
function buildLocationTags(distanceMeters, points, mapName) {
    let distNearest50Km = Math.floor((distanceMeters / (1000 * 100))) * 100
    let tags = [`distance:${distNearest50Km}km`, `fromMap:${mapName}`]

    if (points != null) {
        let pointsNearest50 = Math.floor((points / 100)) * 100
        tags.push(`points:${pointsNearest50}`)
    }

    return tags
}
function isInDateRange(timeStr) {
    let t = new Date(timeStr)
    return t > config.afterTime && t <= config.beforeTime
}
const isMapIncluded = (mapName) => document.querySelector(`input[mapname="${mapName}"]`).checked

async function exportBadGuesses() {
    loadConfig()

    let userId = await getUserID()
    let badGuesses = []
    let includeClassics = document.querySelector("#BadGuessr-classicGame-include").checked
    let includeDuels = document.querySelector("#BadGuessr-duel-include").checked
    let includeMovingDuels = document.querySelector("#BadGuessr-duel-moving").checked
    let includeNoMoveDuels = document.querySelector("#BadGuessr-duel-nomove").checked
    let includeNMPZDuels = document.querySelector("#BadGuessr-duel-nmpz").checked
    let includeBRs = document.querySelector("#BadGuessr-br-include").checked

    if (includeClassics) {
        for (let gameId in classicGames) {
            const game = classicGames[gameId]
            if (game.player.id != userId) continue;
            if (!isMapIncluded(game.mapName)) continue;

            for (let i = 0; i < game.player.guesses.length; i++) {
                const guess = game.player.guesses[i]
                const round = game.rounds[i]
                if (!isBadGuess(guess.distanceInMeters, guess.roundScoreInPoints)) continue;
                if (!isInDateRange(round.startTime)) continue;
                if (guess.skippedRound) continue;

                badGuesses.push({
                    lat: round.lat,
                    lng: round.lng,
                    heading: round.heading,
                    pitch: round.pitch,
                    zoom: round.zoom,
                    extra: {
                        tags: buildLocationTags(guess.distanceInMeters, guess.roundScoreInPoints, game.mapName)
                    }
                })
            }
        }
    }

    if (includeDuels) {
        for (let gameId in duels) {
            const game = duels[gameId]

            const gameType = game.movementOptions.forbidMoving ? 
                             (game.movementOptions.forbidRotating ? "nmpz" : "nomove") : 
                             "moving";

            if ((gameType === "moving" && !includeMovingDuels) ||
                (gameType === "nomove" && !includeNoMoveDuels) ||
                (gameType === "nmpz" && !includeNMPZDuels)) {
                continue;
            }

            if (!isMapIncluded(game.options.map.name)) continue;

            for (let team of game.teams) {
                for (let player of team.players) {
                    if (player.playerId != userId) continue;

                    for (let guess of player.guesses) {
                        const round = game.rounds[guess.roundNumber-1]
                        if (!isBadGuess(guess.distance, guess.score)) continue;
                        if (!isInDateRange(round.startTime)) continue;

                        badGuesses.push({
                            lat: round.panorama.lat,
                            lng: round.panorama.lng,
                            heading: round.panorama.heading,
                            pitch: round.panorama.pitch,
                            zoom: round.panorama.zoom,
                            extra: {
                                tags: buildLocationTags(guess.distance, guess.score, game.options.map.name)
                            }
                        })
                    }
                }
            }
        }
    }

    if (includeBRs) {
        for (let gameId in brGames) {
            const game = brGames[gameId]

            if (!isMapIncluded('World')) continue;

            for (let player of game.players) {
                if (player.playerId != userId) continue;
                
                for (let guess of player.coordinateGuesses) {
                    const round = game.rounds[guess.roundNumber-1]
                    if (!isBadGuess(guess.distance, 5000)) continue;
                    if (!isInDateRange(round.startTime)) continue;
    
                    badGuesses.push({
                        lat: round.lat,
                        lng: round.lng,
                        heading: round.heading,
                        pitch: round.pitch,
                        zoom: round.zoom,
                        extra: {
                            tags: buildLocationTags(guess.distance, null, 'World')
                        }
                    })
                }
            }
        }
    }

    console.log(badGuesses)
    downloadJSON(badGuesses)
}

function loadGames(json, gameMode, competitiveGameMode) {
    // Extract games from current page
    let games = json.entries.filter((d) => {
        const payload = JSON.parse(d.payload);
        return d.payload 
            && payload.gameMode === gameMode 
            && (!competitiveGameMode || payload.competitiveGameMode === competitiveGameMode)
            && isInDateRange(d.time);
    });

    let folders = json.entries.filter((f) => f.type === 7);
    folders.forEach((f) => {
        let d = JSON.parse(f.payload);

        for (let i = 0; i < d.length; i++) {
            if (isInDateRange(d[i].time) && d[i].payload?.gameMode === gameMode && 
                (!competitiveGameMode || d[i].payload?.competitiveGameMode === competitiveGameMode)) {
                    games.push(d[i]);
            }
        }
    });

    return games;
}

async function getUserID() {
    let profile = await getJson("https://www.geoguessr.com/api/v3/profiles")
    return profile.user.id
}

function findCurrentRoundData(rounds, currentRoundNumber) {
    return rounds.find(
        (round) =>
        round.roundNumber === currentRoundNumber ||
        rounds.indexOf(round) === currentRoundNumber - 1
    );
}

async function extractDuelsGuess(jsonData) {
    if (
        !jsonData?.teams ||
        !jsonData?.rounds ||
        !jsonData?.currentRoundNumber
    ) {
        return null;
    }

    const roundData = jsonData.rounds[jsonData.currentRoundNumber - 2];
    if (!roundData || !roundData.panorama) {
        return null;
    }

    for (const team of jsonData.teams) {
        for (const player of team.players) {
        if (player.playerId === CONFIG.GEOGUESSR_PLAYER_ID && player.guesses) {
            const currentGuess = player.guesses.find(
            (g) => g.roundNumber === jsonData.currentRoundNumber - 1
            );
            if (currentGuess) {
            const guessLocation = await fetchLocation(
                currentGuess.lat,
                currentGuess.lng
            );
            const actualLocation = await fetchLocation(
                roundData.panorama.lat,
                roundData.panorama.lng
            );

            return {
                game_id: jsonData.gameId,
                game_type: "duels",
                map_name: jsonData.options?.map?.name,
                movement_restrictions: jsonData.movementOptions,
                guess_lat: currentGuess.lat,
                guess_lng: currentGuess.lng,
                guess_display_name: guessLocation.display_name,
                guess_city: guessLocation.city,
                guess_state: guessLocation.state,
                guess_country: guessLocation.country,
                actual_lat: roundData.panorama.lat,
                actual_lng: roundData.panorama.lng,
                actual_display_name: actualLocation.display_name,
                actual_city: actualLocation.city,
                actual_state: actualLocation.state,
                actual_country: actualLocation.country,
                heading: roundData.panorama.heading,
                pitch: roundData.panorama.pitch,
                zoom: roundData.panorama.zoom,
                distance: currentGuess.distance,
                round_number: currentGuess.roundNumber,
                round_start_time: roundData.startTime,
                guess_time: currentGuess.created,
                steps_count: currentGuess.stepsCount || 0,
                pano_id: roundData.panorama.panoId,
                score: currentGuess.score,
            };
            }
        }
    }
}

return null;
}

async function extractBRDistanceGuess(jsonData) {
    if (
        !jsonData?.players ||
        !jsonData?.rounds ||
        !jsonData?.currentRoundNumber
    ) {
        return null;
    }

    const currentRound = findCurrentRoundData(
        jsonData.rounds,
        jsonData.currentRoundNumber
    );
    if (!currentRound) {
        return null;
    }

    for (const player of jsonData.players) {
        if (
        player.playerId === CONFIG.GEOGUESSR_PLAYER_ID &&
        player.coordinateGuesses
        ) {
        const currentRoundGuesses = player.coordinateGuesses
            .filter((g) => g.roundNumber === jsonData.currentRoundNumber)
            .slice(-1)[0];

        if (!currentRoundGuesses) {
            return null;
        }

        const guessLocation = await fetchLocation(
            currentRoundGuesses.lat,
            currentRoundGuesses.lng
        );
        const actualLocation = await fetchLocation(
            currentRound.lat,
            currentRound.lng
        );

        return {
            game_id: jsonData.gameId,
            game_type: "br",
            movement_restrictions: jsonData.movementOptions,
            guess_lat: currentRoundGuesses.lat,
            guess_lng: currentRoundGuesses.lng,
            guess_display_name: guessLocation.display_name,
            guess_city: guessLocation.city,
            guess_state: guessLocation.state,
            guess_country: guessLocation.country,
            actual_lat: currentRound.lat,
            actual_lng: currentRound.lng,
            actual_display_name: actualLocation.display_name,
            actual_city: actualLocation.city,
            actual_state: actualLocation.state,
            actual_country: actualLocation.country,
            heading: currentRound.heading,
            pitch: currentRound.pitch,
            zoom: currentRound.zoom,
            distance: currentRoundGuesses.distance,
            round_number: currentRoundGuesses.roundNumber,
            round_start_time: currentRound.startTime,
            guess_time: currentRoundGuesses.created,
            steps_count: currentRoundGuesses.stepsCount || 0,
            pano_id: currentRound.panoId,
            score: null,
        };
    }
}

return null;
}

async function extractClassicGuess(jsonData) {
    if (!jsonData?.player?.guesses || !jsonData?.rounds || !jsonData?.round) {
        return null;
    }

    const currentRound = jsonData.round;
    const guess = jsonData.player.guesses[currentRound - 1];
    const round = jsonData.rounds[currentRound - 1];

    if (!guess || !round) {
        return null;
    }

    const guessLocation = await fetchLocation(guess.lat, guess.lng);
    const actualLocation = await fetchLocation(round.lat, round.lng);

    return {
        game_id: jsonData.token,
        game_type: "challenge",
        map: jsonData.map,
        map_name: jsonData.mapName,
        movement_restrictions: {
        forbidMoving: jsonData.forbidMoving,
        forbidZooming: jsonData.forbidZooming,
        forbidRotating: jsonData.forbidRotating,
        },
        guess_lat: guess.lat,
        guess_lng: guess.lng,
        guess_display_name: guessLocation.display_name,
        guess_city: guessLocation.city,
        guess_state: guessLocation.state,
        guess_country: guessLocation.country,
        actual_lat: round.lat,
        actual_lng: round.lng,
        actual_display_name: actualLocation.display_name,
        actual_city: actualLocation.city,
        actual_state: actualLocation.state,
        actual_country: actualLocation.country,
        heading: round.heading,
        pitch: round.pitch,
        zoom: round.zoom,
        distance: guess.distanceInMeters,
        score: guess.roundScoreInPoints,
        round_number: currentRound,
        round_start_time: round.startTime,
        guess_time: guess.created || new Date().toISOString(),
        steps_count: guess.stepsCount || 0,
        pano_id: round.panoId,
    };
}

async function processApiResponse(jsonData, gameType) {
    console.log("[GeoStats] Processing data", jsonData);
    let guess = null;

    try {
      console.log("[GeoStats] Attempting to extract duels guess");
      if (gameType === ENDPOINTS.DUELS_GUESS) {
        guess = await extractDuelsGuess(jsonData);
      } else if (gameType === ENDPOINTS.BR_DISTANCE_GUESS) {
        guess = await extractBRDistanceGuess(jsonData);
      } else if (gameType === ENDPOINTS.CLASSIC_GUESS) {
        guess = await extractClassicGuess(jsonData);
      }

      if (guess) {
        console.log("[GeoStats] Extracted guess:", guess);
        await sendToSupabase(guess);
      }
    } catch (error) {
      console.error("[GeoStats] Error in processApiResponse:", error);
    }
  }

async function loadAllActivity() {
    console.log("Attempting to load all activity")
    let loadActivityBtn = document.querySelector("#BadGuessr-loadAllActivity")
    let loadGameDataBtn = document.querySelector("#BadGuessr-loadGameData")
    let loadGameLocsBtn = document.querySelector("#BadGuessr-loadGameLocs")
    let exportBadGuessesBtn = document.querySelector("#BadGuessr-export")

    disableButton(loadActivityBtn, "Loading Activity...")
    disableButton(loadGameDataBtn)
    disableButton(loadGameLocsBtn)
    disableButton(exportBadGuessesBtn)

    loadConfig()

    duelsTypes = {
        moving: [],
        noMove: [],
        nmpz: []
    }
    classic = []
    battleRoyale = []

    let includeClassics = document.querySelector("#BadGuessr-classicGame-include").checked
    let includeDuels = document.querySelector("#BadGuessr-duel-include").checked
    let includeMovingDuels = document.querySelector("#BadGuessr-duel-moving").checked
    let includeNoMoveDuels = document.querySelector("#BadGuessr-duel-nomove").checked
    let includeNMPZDuels = document.querySelector("#BadGuessr-duel-nmpz").checked
    let includeBRs = document.querySelector("#BadGuessr-br-include").checked
    let paginationToken = null

    try {
        do {
            // Build URL with pagination token if available
            let url = "https://www.geoguessr.com/api/v4/feed/private?count=26";
            if (paginationToken) {
                url += `&paginationToken=${encodeURIComponent(paginationToken)}`;
            }

            // Fetch data
            let response = await fetch(url);
            let json = await response.json();

            // Track if any new games were found in this batch
            let newGamesFound = 0;
            let classicBefore = classic.length;
            let duelMovingBefore = duelsTypes.moving.length;
            let duelNoMoveBefore = duelsTypes.noMove.length;
            let duelNMPZBefore = duelsTypes.nmpz.length;
            let brBefore = battleRoyale.length;

            if (includeClassics) {
                classic = classic.concat(loadGames(json, "Standard", null))
            }
            if (includeDuels) {
                if (includeMovingDuels) {
                    duelsTypes.moving = duelsTypes.moving.concat(loadGames(json, "Duels", "StandardDuels"))
                }
                if (includeNoMoveDuels) {
                    duelsTypes.noMove = duelsTypes.noMove.concat(loadGames(json, "Duels", "NoMoveDuels"))
                }
                if (includeNMPZDuels) {
                    duelsTypes.nmpz = duelsTypes.nmpz.concat(loadGames(json, "Duels", "NMPZDuels"))
                }
            }
            if (includeBRs) {
                battleRoyale = battleRoyale.concat(loadGames(json, "BattleRoyaleDistance", "StandardDuels"))
            }

            // Calculate how many new games were found in this batch
            newGamesFound = 
                (includeClassics ? classic.length - classicBefore : 0) +
                (includeDuels && includeMovingDuels ? duelsTypes.moving.length - duelMovingBefore : 0) +
                (includeDuels && includeNoMoveDuels ? duelsTypes.noMove.length - duelNoMoveBefore : 0) +
                (includeDuels && includeNMPZDuels ? duelsTypes.nmpz.length - duelNMPZBefore : 0) +
                (includeBRs ? battleRoyale.length - brBefore : 0);

            updateActivityCounters()

            // Update pagination token for next iteration
            paginationToken = json.paginationToken;
            
            // If no new games were found in the date range and we have more pages, stop paginating
            if (newGamesFound === 0 && paginationToken) {
                console.log("No new games found in date range, stopping pagination");
                break;
            }
        } while (paginationToken); // Continue while there's a pagination token  
    } catch(e) {
        console.error(e)
        updateActivityCounters()
        return
    } finally {
        enableButton(loadActivityBtn)
        enableButton(loadGameDataBtn)
        enableButton(loadGameLocsBtn)
        enableButton(exportBadGuessesBtn)
        loadActivityBtn.innerText = "Load all Activity"
    }
}

async function loadGameDetails() {
    let loadActivityBtn = document.querySelector("#BadGuessr-loadAllActivity")
    let loadGameDataBtn = document.querySelector("#BadGuessr-loadGameData")
    let exportBadGuessesBtn = document.querySelector("#BadGuessr-export")
    if (loadGameDataBtn == undefined) return;

    try {
        disableButton(loadActivityBtn)
        disableButton(loadGameDataBtn, "Fetching game data...")
        disableButton(exportBadGuessesBtn)
        let includeClassics = document.querySelector("#BadGuessr-classicGame-include").checked
        let includeDuels = document.querySelector("#BadGuessr-duel-include").checked
        let includeMovingDuels = document.querySelector("#BadGuessr-duel-moving").checked
        let includeNoMoveDuels = document.querySelector("#BadGuessr-duel-nomove").checked
        let includeNMPZDuels = document.querySelector("#BadGuessr-duel-nmpz").checked
        let includeBRs = document.querySelector("#BadGuessr-br-include").checked
    
        for (let i = 0; i < classic.length && includeClassics; i++) {
            let game = classic[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameToken = gamePayload.gameToken

            if (gameToken == undefined) {
                // TODO add support for daily challenges
                console.log("Skipping classic game without gameToken (likely daily challenge)")
                continue
            } else if (classicGames[gameToken] != undefined) {
                console.log(`Skipping already processed classic game: ${gameToken}`)
                continue
            }
    
            console.log(`Fetching classic game: ${gameToken}`)
            let url = `https://www.geoguessr.com/api/v3/games/${gameToken}`

            let gameSummary = await getJson(url)
            classicGames[gameToken] = gameSummary
    
            if (maps[gameSummary.mapName] != undefined) {
                maps[gameSummary.mapName] += 1
            } else {
                maps[gameSummary.mapName] = 1
            }
            updateActivityCounters()
        }
    
        for (let i = 0; i < duelsTypes.moving.length && includeDuels && includeMovingDuels; i++) {
            let game = duelsTypes.moving[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId

            if (duels[gameId] != undefined) {
                console.log(`Skipping already processed moving duel: ${gameId}`)
                continue
            }
    
            console.log(`Fetching moving duel: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/duels/${gameId}`

            let gameSummary = await getJson(url)
            duels[gameId] = gameSummary
    
            if (maps[gameSummary.options.map.name] != undefined) {
                maps[gameSummary.options.map.name] += 1
            } else {
                maps[gameSummary.options.map.name] = 1
            }
    
            updateActivityCounters()
        }

        for (let i = 0; i < duelsTypes.noMove.length && includeDuels && includeNoMoveDuels; i++) {
            let game = duelsTypes.noMove[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId
            
            if (duels[gameId] != undefined) {
                console.log(`Skipping already processed no move duel: ${gameId}`)
                continue
            }
    
            console.log(`Fetching no move duel: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/duels/${gameId}`

            let gameSummary = await getJson(url)
            duels[gameId] = gameSummary
    
            if (maps[gameSummary.options.map.name] != undefined) {
                maps[gameSummary.options.map.name] += 1
            } else {
                maps[gameSummary.options.map.name] = 1
            }
    
            updateActivityCounters()
        }

        for (let i = 0; i < duelsTypes.nmpz.length && includeDuels && includeNMPZDuels; i++) {
            let game = duelsTypes.nmpz[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId

            if (duels[gameId] != undefined) {
                console.log(`Skipping already processed NMPZ duel: ${gameId}`)
                continue
            }
    
            console.log(`Fetching NMPZ duel: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/duels/${gameId}`

            let gameSummary = await getJson(url)
            duels[gameId] = gameSummary
    
            if (maps[gameSummary.options.map.name] != undefined) {
                maps[gameSummary.options.map.name] += 1
            } else {
                maps[gameSummary.options.map.name] = 1
            }
        
            updateActivityCounters()
        }
    
        for (let i = 0; i < battleRoyale.length && includeBRs; i++) {
            let game = battleRoyale[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId

            if (brGames[gameId] != undefined) {
                console.log(`Skipping already processed BR game: ${gameId}`)
                continue
            }
    
            console.log(`Fetching BR: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/battle-royale/${gameId}`

            let gameSummary = await getJson(url)
            brGames[gameId] = gameSummary
    
            if (maps.World != undefined) {
                maps.World += 1
            } else {
                maps.World = 1
            }
    
            updateActivityCounters()
        }
    } catch(e) {
        console.error(e)
    }

    enableButton(loadActivityBtn)
    enableButton(loadGameDataBtn, "Load game data")
    enableButton(exportBadGuessesBtn)

    drawMapSelection()
}

async function loadGameLocs() {
    let loadLocBtn = document.querySelector("#BadGuessr-loadGameLocs")
    let loadActivityBtn = document.querySelector("#BadGuessr-loadAllActivity")
    let loadGameDataBtn = document.querySelector("#BadGuessr-loadGameData")
    let exportBadGuessesBtn = document.querySelector("#BadGuessr-export")
    if (loadLocBtn == undefined) return;

    try {
        disableButton(loadActivityBtn)
        disableButton(loadGameDataBtn)
        disableButton(loadLocBtn, "Loading game locations...")
        disableButton(exportBadGuessesBtn)
        let includeClassics = document.querySelector("#BadGuessr-classicGame-include").checked
        let includeDuels = document.querySelector("#BadGuessr-duel-include").checked
        let includeMovingDuels = document.querySelector("#BadGuessr-duel-moving").checked
        let includeNoMoveDuels = document.querySelector("#BadGuessr-duel-nomove").checked
        let includeNMPZDuels = document.querySelector("#BadGuessr-duel-nmpz").checked
        let includeBRs = document.querySelector("#BadGuessr-br-include").checked

        for (let i = 0; i < classic.length && includeClassics; i++) {
            let game = classic[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameToken = gamePayload.gameToken

            if (gameToken == undefined) {
                // TODO add support for daily challenges
                console.log("Skipping classic game without gameToken (likely daily challenge)")
                continue
            } else if (classicGames[gameToken] != undefined) {
                console.log(`Skipping already processed classic game: ${gameToken}`)
                continue
            }
    
            console.log(`Fetching classic game: ${gameToken}`)
            let url = `https://www.geoguessr.com/api/v3/games/${gameToken}`

            let gameSummary = await getJson(url)
            classicGames[gameToken] = gameSummary
    
            await processApiResponse(gameSummary, ENDPOINTS.CLASSIC_GUESS);
            updateActivityCounters()
        }

        for (let i = 0; i < duelsTypes.moving.length && includeDuels && includeMovingDuels; i++) {
            let game = duelsTypes.moving[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId

            if (duels[gameId] != undefined) {
                console.log(`Skipping already processed moving duel: ${gameId}`)
                continue
            }
    
            console.log(`Fetching moving duel: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/duels/${gameId}`

            let gameSummary = await getJson(url)
            duels[gameId] = gameSummary
    
            await processApiResponse(gameSummary, ENDPOINTS.DUELS_GUESS);
            updateActivityCounters()
        }

        for (let i = 0; i < duelsTypes.noMove.length && includeDuels && includeNoMoveDuels; i++) {
            let game = duelsTypes.noMove[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId

            if (duels[gameId] != undefined) {
                console.log(`Skipping already processed no move duel: ${gameId}`)
                continue
            }
    
            console.log(`Fetching moving duel: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/duels/${gameId}`

            let gameSummary = await getJson(url)
            duels[gameId] = gameSummary
    
            await processApiResponse(gameSummary, ENDPOINTS.DUELS_GUESS);
            updateActivityCounters()
        }

        for (let i = 0; i < duelsTypes.nmpz.length && includeDuels && includeNMPZDuels; i++) {
            let game = duelsTypes.nmpz[i]

            const gamePayload = typeof game.payload === 'string' ? JSON.parse(game.payload) : game.payload;
            const gameId = gamePayload.gameId

            if (duels[gameId] != undefined) {
                console.log(`Skipping already processed NMPZ duel: ${gameId}`)
                continue
            }
    
            console.log(`Fetching moving duel: ${gameId}`)
            let url = `https://game-server.geoguessr.com/api/duels/${gameId}`

            let gameSummary = await getJson(url)
            duels[gameId] = gameSummary
    
            await processApiResponse(gameSummary, ENDPOINTS.DUELS_GUESS);
            updateActivityCounters()
        }
    } catch(e) {
        console.error(e)
    }

    enableButton(loadLocBtn, "Load game locs")
    enableButton(loadActivityBtn)
    enableButton(loadGameDataBtn)
    enableButton(exportBadGuessesBtn)
}

(async function() {
    'use strict';

    setInterval(() => {
        updateActivityCounters()
    }, 250)

    while (true) {
        let shouldDrawUI = document.querySelector(".activities_switch__s09KS") != undefined && document.querySelector("#BadGuessr-frame") == undefined
        if (shouldDrawUI) drawUI();
        
        await sleep(250)
    }
})();
