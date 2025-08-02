const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");

const { parser } = require("stream-json");
const { streamObject } = require("stream-json/streamers/StreamObject");
const { chain } = require("stream-chain");

const ImgUtil = require("./img-utils.js");

const pieceColors = ["white", "black"],
    pieceTypes = ["knight", "bishop", "rook", "queen"],
    allTypes = pieceTypes.concat(["pawn", "king"]);

const validImageTypes = ["white_kings", "black_kings", "monochrome", "colors"];

let outputDir, imageType;

function HSLtoRGB(h, s, l) {
    h = Math.max(0, Math.min(360, h)) / 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    const hueToRGB = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;

        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s,
        p = 2 * l - q;

    const r = hueToRGB(p, q, h + 1 / 3),
        g = hueToRGB(p, q, h),
        b = hueToRGB(p, q, h - 1 / 3);

    return [r * 255, g * 255, b * 255].map(c => Math.floor(c));
}

function tint(color, towards, amount) {
    let target = 0;

    switch (towards) {
        case "white":
            target = 255;
            break;
        case "black":
            target = 0;
            break;
    }

    return color.map(c => Math.floor(c + (target - c) * amount));
}

function genPieceColors() {
    const rgbColors = {};

    switch (imageType) {
        case "white_kings":
        case "black_kings":
            rgbColors["king"] = [255, 255, 255];
            break;
        case "monochrome":
            rgbColors["white"] = [255, 255, 255];
            rgbColors["black"] = [0, 0, 0];
            break;
        case "colors":
            rgbColors["king_white"] = [255, 255, 255];
            rgbColors["king_black"] = [0, 0, 0];

            for (const color of pieceColors) {
                rgbColors[`pawn_${color}`] = rgbColors[`promoted_pawn_${color}`] = tint([128, 128, 128], color, 0.5);
            }

            pieceTypes.forEach((type, i) => {
                const hue = Math.floor((360 * i) / pieceTypes.length),
                    base = HSLtoRGB(hue, 90, 50);

                for (const color of pieceColors) {
                    rgbColors[`${type}_${color}`] = tint(base, color, 0.5);
                }
            });

            break;
    }

    return rgbColors;
}

async function saveBoardPNG(outputDir, buf, boardSide) {
    let fileName;

    switch (imageType) {
        case "monochrome":
            fileName = `board_gray.png`;
            break;
        case "colors":
            fileName = `board_color.png`;
            break;
        default:
            fileName = `board_${imageType}.png`;
            break;
    }

    console.log("Encoding PNG...");

    const outPath = await ImgUtil.saveImgPNG(
        {
            filePath: fileName,
            fileDir: outputDir
        },
        buf,
        boardSide,
        boardSide
    ).catch(() => process.exit(1));

    console.log(`Saved PNG to ${outPath}`);
}

function processPiece(buf, piece, boardSide, rgbColors) {
    if (
        piece == null ||
        typeof piece.color !== "string" ||
        typeof piece.x !== "number" ||
        typeof piece.y !== "number"
    ) {
        return false;
    }

    switch (imageType) {
        case "white_kings":
            if (piece.type !== "king" || piece.color !== "white") return false;
            break;
        case "black_kings":
            if (piece.type !== "king" || piece.color !== "black") return false;
            break;
    }

    let x, y, color;

    switch (imageType) {
        case "white_kings":
        case "black_kings":
            [x, y] = [Math.floor(piece.x / 8), Math.floor(piece.y / 8)];
            color = rgbColors["king"];
            break;
        case "monochrome":
            [x, y] = [piece.x, piece.y];
            color = rgbColors[piece.color];
            break;
        case "colors":
            [x, y] = [piece.x, piece.y];
            color = rgbColors[`${piece.type}_${piece.color}`];
            break;
    }

    ImgUtil.setImgPixel(buf, x, y, boardSide, boardSide, color);
    return true;
}

async function processFile(buf, filePath, boardSide, rgbColors, counters, updateProgress) {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(filePath, { encoding: "utf8" }),
            pipeline = chain([readStream, parser(), streamObject()]);

        pipeline.on("data", ({ value }) => {
            if (!Array.isArray(value)) return;

            for (const piece of value) {
                if (processPiece(buf, piece, boardSide, rgbColors)) {
                    counters.pieces++;

                    if (imageType.includes("kings") || counters.pieces % 1000 === 0) {
                        updateProgress();
                    }
                }
            }
        });

        pipeline.on("error", err => {
            console.error(`\nERROR: Occured while processing ${filePath}:`);
            console.error(err);

            reject(err);
        });

        pipeline.on("end", () => {
            console.log(`\nFinished processing: ${filePath}`);
            counters.files++;

            updateProgress();
            resolve();
        });
    });
}

async function findFiles() {
    let fileNames;

    try {
        fileNames = await fsPromises.readdir(outputDir);
    } catch (err) {
        if (err.code === "ENOENT") {
            console.error(`ERROR: Input directory not found at: ${outputDir}`);
        } else {
            console.error("ERROR: Occured while reading input directory:");
            console.error(err);
        }

        process.exit(1);
    }

    const files = fileNames.filter(file => file.endsWith(".json")).map(file => path.resolve(outputDir, file));

    if (files.length === 0) {
        console.error(`ERROR: No JSON files found in: ${outputDir}`);
        process.exit(1);
    }

    return files;
}

async function processFiles(buf, boardSide, rgbColors) {
    const files = await findFiles();
    console.log(`Processing ${files.length} files...`);

    const counters = { files: 0, pieces: 0 };

    const updateProgress = () => {
        process.stdout.write(
            `\rFiles: ${counters.files}/${files.length} | Pieces: ${counters.pieces.toLocaleString()}`
        );
    };

    updateProgress();
    await Promise.all(files.map(file => processFile(buf, file, boardSide, rgbColors, counters, updateProgress)));

    updateProgress();
    process.stdout.write("\n");
}

const usage = `Usage: node gen-board-image.js [imageType] [outputDir]

Available image types:
    white_kings - White kings only
    black_kings - Black kings only
    monochrome - Black and white pieces
    colors - Color coded pieces (default)`;

const helpArgs = ["-h", "--help"];

function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length < 1 || helpArgs.some(help => args.includes(help))) {
        console.log(usage);
        process.exit(0);
    }

    imageType = args[0] ?? validImageTypes[3];

    if (!validImageTypes.includes(imageType)) {
        console.error(`ERROR: Invalid image type provided: "${imageType}"`);
        console.info("Available types:", validImageTypes.join(", "));
        process.exit(1);
    }

    outputDir = args[1] ?? "./out";
}

async function main() {
    parseArgs();

    const kingsImg = imageType.includes("kings"),
        boardSide = kingsImg ? 1000 : 8000;

    const rgbColors = genPieceColors(),
        buf = ImgUtil.allocImgBuffer(boardSide, boardSide, kingsImg);

    if (!kingsImg) {
        for (let i = 0; i < buf.length; i += 4) {
            buf[i] = buf[i + 1] = buf[i + 2] = 32;
            buf[i + 3] = 255;
        }
    }

    await processFiles(buf, boardSide, rgbColors);
    await saveBoardPNG(outputDir, buf, boardSide);
}

main();
