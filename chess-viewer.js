const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const ImgUtil = require("./img-utils.js");

const chessUrl = "https://onemillionchessboards.com";

const outputDir = "./out",
    inputName = "board_black_kings.png";

const windowConfig = {
    fullscreen: false,
    width: 1920,
    height: 1080
};

const playerColor = "white",
    kingsColor = "black",
    kingsRGBA = [255, 255, 255, 255];

const boardSide = 1000,
    startPos = { x: 2, y: 2 };

const hotkeys = {
    next: "t",
    prev: "n",
    skip: "s",

    panLeft: "l",
    panRight: "r",
    panUp: "u",
    panDown: "d"
};

class King {
    constructor(x, y) {
        this.boardX = x;
        this.boardY = y;

        this.x = Math.min(Math.max(x * 8, 0), 7999);
        this.y = Math.min(Math.max(y * 8, 0), 7999);

        this.exists = true;
    }
}

async function readBoardPNG() {
    const [buf, width, height] = await ImgUtil.readImgPNG({
        filePath: inputName,
        fileDir: outputDir
    }).catch(() => process.exit(1));

    if (width !== boardSide || height !== boardSide) {
        console.error("ERROR: Invalid image size.");
        process.exit(1);
    }

    return buf;
}

async function parseKings() {
    const first = new King(0, 0);
    Object.assign(first, startPos);
    first.exists = false;

    const buf = await readBoardPNG(),
        kings = [first];

    for (let y = 0; y < boardSide; y++) {
        for (let x = 0; x < boardSide; x++) {
            const pixel = ImgUtil.readImgPixel(buf, x, y, boardSide, boardSide);

            if (ImgUtil.pixelsMatch(pixel, kingsRGBA)) {
                kings.push(new King(x, y));
            }
        }
    }

    if (kings.length === 0) {
        console.error("ERROR: No kings found in the image.");
        process.exit(1);
    }

    return kings;
}

async function saveKings(kings) {
    let changed = false;
    const buf = ImgUtil.allocImgBuffer(boardSide, boardSide, true);

    for (const king of kings.slice(1)) {
        if (!king.exists) {
            changed = true;
            continue;
        }

        ImgUtil.setImgPixel(buf, king.boardX, king.boardY, boardSide, boardSide, kingsRGBA);
    }

    if (!changed) return;

    await ImgUtil.saveImgPNG(
        {
            filePath: inputName,
            fileDir: outputDir
        },
        buf,
        boardSide,
        boardSide
    );
}

async function launchBrowser() {
    const browserOpts = {
        headless: false,
        userDataDir: "./cache",
        defaultViewport: null,
        args: []
    };

    if (windowConfig.fullscreen) {
        browserOpts.args.push("--start-maximized");
    } else {
        browserOpts.args.push(`--window-size=${windowConfig.width},${windowConfig.height}`);
    }

    return puppeteer.launch(browserOpts);
}

async function preparePage(page) {
    const url = `${chessUrl}/#${startPos.x},${startPos.y}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    /* eslint-disable */
    await page.evaluate(color => {
        localStorage.setItem("colorPref", color);
    }, playerColor);
    /* eslint-enable */

    await page.reload({ waitUntil: "domcontentloaded" });
}

async function injectUtilFuncs(page, kings) {
    await page.exposeFunction("getKingPositions", () => kings);

    await page.exposeFunction("unmarkKing", idx => {
        const king = kings[idx];
        if (king == null) return;
        kings[idx].exists = false;
    });

    await page.exposeFunction("remarkKing", idx => {
        const king = kings[idx];
        if (king == null) return;
        kings[idx].exists = true;
    });

    /* eslint-disable */
    await page.evaluate(startPos => {
        window.setGamePosition = pos => {
            if (pos == null) return;

            window.gamePosition = pos;
            location.hash = `#${pos.x},${pos.y}`;

            console.log("Moved to:", pos.x, pos.y);
        };

        window.setGamePositionRelative = (x, y) => {
            const pos = window.gamePosition ?? startPos,
                newPos = {
                    x: Math.min(Math.max(pos.x + x, 2), 7997),
                    y: Math.min(Math.max(pos.y + y, 2), 7997)
                };

            window.gamePosition = newPos;
            location.hash = `#${newPos.x},${newPos.y}`;

            console.log("Moved to:", newPos.x, newPos.y);
        };
    }, startPos);
    /* eslint-enable */
}

async function injectHotkeyListener(page) {
    /* eslint-disable */
    await page.evaluate(async hotkeys => {
        window.current = 0;

        document.addEventListener("keydown", async e => {
            const hotkey = e.key.toLowerCase();
            if (!Object.values(hotkeys).includes(hotkey)) return;

            switch (hotkey) {
                case hotkeys.panLeft:
                    window.setGamePositionRelative(8, 0);
                    return;
                case hotkeys.panRight:
                    window.setGamePositionRelative(-8, 0);
                    return;
                case hotkeys.panUp:
                    window.setGamePositionRelative(0, -8);
                    return;
                case hotkeys.panDown:
                    window.setGamePositionRelative(0, 8);
                    return;
            }

            const kings = await window.getKingPositions(),
                length = kings.length;

            switch (hotkey) {
                case hotkeys.next:
                    await window.unmarkKing(window.current);
                case hotkeys.skip:
                    window.current = (window.current + 1) % length;
                    break;
                case hotkeys.prev:
                    window.current = (window.current - 1 + length) % length;
                    await window.remarkKing(window.current);
                    break;
            }

            window.setGamePosition(kings[window.current]);
        });

        console.log("Hotkey listener ready.");
    }, hotkeys);
    /* eslint-enable */
}

function registerHandlers(browser, kings) {
    const cleanup = async () => {
        console.log("Saving modified image before exit...");
        await saveKings(kings);
    };

    process.on("SIGINT", async () => {
        await cleanup();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        await cleanup();
        process.exit(0);
    });

    process.on("beforeExit", async () => {
        await cleanup();
    });

    browser.on("disconnected", async () => {
        await cleanup();
        process.exit(0);
    });
}

function printHotkeys() {
    console.log(`Press "${hotkeys.next}" in browser to jump to next ${kingsColor} king.`);
    console.log(`Press "${hotkeys.prev}" in browser to jump to previous ${kingsColor} king.\n`);

    const hotkeysFormat = Object.entries(hotkeys)
        .map(([name, key]) => `    - ${name}: ${key}`)
        .join("\n");
    console.log(`Available hotkeys:\n${hotkeysFormat}`);
}

async function main() {
    const kings = await parseKings();

    const browser = await launchBrowser(),
        page = (await browser.pages())[0];

    registerHandlers(browser, kings);
    await preparePage(page);

    await injectUtilFuncs(page, kings);
    await injectHotkeyListener(page);

    console.log("Browser launched successfully.\n");
    printHotkeys();
}

main();
