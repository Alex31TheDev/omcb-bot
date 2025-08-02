const fs = require("fs");
const path = require("path");

const { ChessClient, Board, PieceTypes } = require("./ChessClient.js");
const ImgUtil = require("./img-utils.js");

ChessClient.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0";
ChessClient.Cookies["cf_clearance"] = "";

const globalHandler = false;

if (globalHandler) {
    process.on("uncaughtException", () => {});
    process.on("unhandledRejection", () => {});
}

const maxRetryCount = 3;
const reconnectCount = 100;

let stopAll = false;

async function captureLoop(k, x0, y0, count, maxX) {
    const client = new ChessClient(x0, y0, "white", {
        k,
        maxRetryCount: 1,
        maxRPS: 1.5
    });

    const reconnectClient = async () => {
        console.log(`(${k}): reconnecting`);
        client.disconnect();

        client.x0 = boardX;
        client.y0 = boardY;

        await ChessClient.delay(10000);
        await client.init();
        await ChessClient.delay(3000);
    };

    await client.init();
    await ChessClient.delay(1000);

    let i, j;
    let boardX, boardY;

    for (j = 0, boardY = y0; j < count; j++, boardY += 8) {
        if (j > 0) {
            await reconnectClient();
        }

        const pref = `(${k}) ${i}.`;
        let successes = 0;

        for (i = 0, boardX = x0; boardX <= maxX; i++, boardX += 8) {
            if (stopAll) {
                await new Promise(resolve => setInterval(() => (!stopAll ? resolve() : void 0)), 100);
                await ChessClient.delay(ChessClient._getRetryTime(5000, 10000, true));
            }

            let failed = true;

            try {
                await (async () => {
                    if (client.board.get(boardX + 4, boardY)?._type !== PieceTypes.PIECE_TYPE_KING) return;

                    const doMove = async () => {
                        failed = true;

                        let knight = client.board.get(boardX + 1, boardY + 7);
                        if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                            await client.movePiece(knight, knight.x - 1, knight.y - 2);
                        }

                        knight = client.board.get(boardX, boardY + 5);
                        if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                            await client.movePiece(knight, knight.x + 1, knight.y - 2);
                        }

                        knight = client.board.get(boardX + 1, boardY + 3);
                        if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                            await client.movePiece(knight, knight.x + 1, knight.y - 2);
                        }

                        knight = client.board.get(boardX + 2, boardY + 1);
                        if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                            await client.movePiece(knight, knight.x + 2, knight.y - 1);
                            failed = false;
                        }
                    };

                    let retries = 0;

                    while (true) {
                        try {
                            return await doMove();
                        } catch (err) {
                            if (
                                !["Invalid", "timed out"].some(msg => err.message.includes(msg)) ||
                                ++retries > maxRetryCount
                            ) {
                                throw err;
                            }

                            console.log(`(${k}) ${i}. retrying move: ${retries} ; ${boardX},${boardY}`, err.message);
                            await ChessClient.delay(ChessClient._getRetryTime(2000, 3000, true));

                            if (retries > 1) {
                                stopAll = true;
                                await reconnectClient();

                                await ChessClient.delay(ChessClient._getRetryTime(15000, 3000, true));
                                stopAll = false;
                            }
                        }
                    }
                })();
            } catch (err) {
                console.error(pref, err?.message);
            }

            successes += Number(!failed);
            if (!failed) console.log(`${pref} ${boardX},${boardY} - success`);

            if (successes % reconnectCount === reconnectCount - 1) {
                await reconnectClient();
                successes++;
            } else if (boardX - client.board.centerX > ChessClient._minViewDist) {
                let retries = 0;

                while (true) {
                    try {
                        await client.moveView(boardX, boardY);
                        await ChessClient.delay(failed ? 300 : 1000);
                        break;
                    } catch (err) {
                        if (++retries > maxRetryCount) throw err;

                        console.log(`${pref} retrying view: ${retries} ; ${boardX},${boardY}`);
                        await ChessClient.delay(ChessClient._getRetryTime(10000, 3000, true));
                    }
                }
            } else {
                await ChessClient.delay(ChessClient._getRetryTime(failed ? 300 : 500, 600, false));
            }
        }
    }

    client.destroy();
}

const outDir = "./out";

async function main1() {
    const [x0, y0] = [8, 112],
        n = 15;

    const count = Math.ceil(1000 / n),
        tasks = [];

    for (let i = 0; i < n; i++) {
        const y = y0 + count * i * 8;
        tasks.push(captureLoop(i, x0, y, count, 7999).catch(err => console.error(err)));

        await ChessClient.delay(ChessClient._getRetryTime(5000, 2000, false));
    }

    await Promise.all(tasks);
    console.log("All clients finished.");
}

const size = 8000,
    range = 95,
    radius = 47;

async function processStripe(k, yStart, yEnd) {
    const client = new ChessClient(Board.minCenter, "white", {
        k,
        maxRetryCount: 1
    });

    await client.init();
    await ChessClient.delay(1000);

    const outPath = path.resolve(outDir, `board_output_${k}.json`),
        writeStream = fs.createWriteStream(outPath);

    writeStream.write("{\n");

    const getSteps = (start, end, step, maxCoord) => {
        const steps = [];

        for (let i = start; i <= end; i += step) steps.push(Math.min(i, maxCoord));
        if (steps.at(-1) < end) steps.push(Math.min(end, maxCoord));

        return steps;
    };

    const xSteps = getSteps(radius, size - radius, range, 7997),
        ySteps = getSteps(yStart, Math.min(yEnd, size) - radius, range, 7997);

    let i = 0;

    for (const y of ySteps) {
        for (const x of xSteps) {
            const pref = `(${k}) ${i}.`;
            console.log(pref, x, y);

            let retries = 0;

            while (true) {
                try {
                    await client.moveView(x, y);
                    break;
                } catch (err) {
                    if (++retries > maxRetryCount) throw err;

                    console.log(`${pref} retrying view: ${retries} ; ${x},${y}`);
                    await ChessClient.delay(ChessClient._getRetryTime(10000, 3000, true));
                }
            }

            const jsonPrefix = `${i === 0 ? "" : ",\n"}`,
                key = `"${x},${y}"`,
                value = client.board.toString(false);

            writeStream.write(`${jsonPrefix}    ${key}: ${value}`);
            i++;

            await ChessClient.delay(1000);
        }
    }

    writeStream.write("\n}\n");
    writeStream.end(() => {
        console.log(`All board data written to ${outPath}`);
    });

    client.destroy();
}

async function main2() {
    const count = 18,
        tasks = [];

    const stripeHeight = Math.floor((size - radius) / count);

    for (let i = 0; i < count; i++) {
        const yStart = radius + i * stripeHeight,
            yEnd = i === count - 1 ? size : radius + (i + 1) * stripeHeight;

        tasks.push(processStripe(i, yStart, yEnd));
        await ChessClient.delay(ChessClient._getRetryTime(5000, 2000, false));
    }

    await Promise.all(tasks);
    console.log("All clients finished.");
}

async function parseBoards() {
    const [buf, width, height] = await ImgUtil.readImgPNG("./output.png"),
        boards = [];

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pos = 4 * (y * width + x),
                pixel = buf.slice(pos, pos + 4);

            if (pixel.every((c, i) => c === 255)) {
                boards.push({ x: x * 8, y: y * 8 });
            }
        }
    }

    return boards;
}

async function main3() {
    const boards = await parseBoards();

    const client = new ChessClient(2, 2, "white", {
        maxRetryCount: 1,
        maxRPS: 1.5
    });
    await client.init();

    let prev = { x: 2, y: 2 };
    for (const [i, board] of boards.entries()) {
        if (Board.distance(board.x, board.y, prev.x, prev.y) > ChessClient.minViewDist) {
            await client.moveView(Math.max(2, board.x), board.y);
        }

        let failed;
        const doMove = async () => {
            failed = true;

            if (client.board.get(board.x + 4, board.y)?._type !== PieceTypes.PIECE_TYPE_KING) return;

            let knight = client.board.get(board.x + 4, board.y + 8);
            if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                await client.movePiece(knight, knight.x - 2, knight.y + 1);
            }

            knight = client.board.get(board.x + 2, board.y + 9);
            if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                await client.movePiece(knight, knight.x - 1, knight.y - 2);
            }

            knight = client.board.get(board.x + 1, board.y + 7);
            if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                await client.movePiece(knight, knight.x - 1, knight.y - 2);
            }

            knight = client.board.get(board.x, board.y + 5);
            if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                await client.movePiece(knight, knight.x + 1, knight.y - 2);
            }

            knight = client.board.get(board.x + 1, board.y + 3);
            if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                await client.movePiece(knight, knight.x + 1, knight.y - 2);
            }

            knight = client.board.get(board.x + 2, board.y + 1);
            if (knight !== null && knight._type === PieceTypes.PIECE_TYPE_KNIGHT) {
                await client.movePiece(knight, knight.x + 2, knight.y - 1);
                failed = false;
            }
        };

        try {
            await doMove();
        } catch (err) {}
        if (!failed) console.log(`${i}: ${board.x},${board.y} - success`);

        await ChessClient.delay(1000);
        prev = board;
    }

    client.destroy();
}

async function main4() {}

(() => {
    const args = process.argv.slice(2),
        progIdx = parseInt(args[0] ?? "1", 10);

    switch (progIdx) {
        case 1:
            main1();
            break;
        case 2:
            main2();
            break;
        case 3:
            main3();
            break;
        case 4:
            main4();
            break;
        default:
            console.log("Invalid index.");
            process.exit(1);
    }
})();
