const ImgUtil = require("./img-utils.js");

function compareTile(input, inputW, inputH, filter, filterW, filterH, x, y) {
    const startX = Math.max(0, -x),
        startY = Math.max(0, -y);

    const endX = Math.min(filterW, inputW - x),
        endY = Math.min(filterH, inputH - y);

    if (endX <= startX || endY <= startY) return false;

    for (let ty = startY; ty < endY; ty++) {
        for (let tx = startX; tx < endX; tx++) {
            const inputPixel = ImgUtil.readImgPixel(input, x + tx, y + ty, inputW, inputH),
                filterPixel = ImgUtil.readImgPixel(filter, tx, ty, filterW, filterH);

            if (!ImgUtil.pixelsMatch(inputPixel, filterPixel)) return false;
        }
    }

    return true;
}

const usage = "Usage: node filter-image.js (input.png) (filter.png) (output.png) [offsetX] [offsetY]";
const helpArgs = ["-h", "--help"];

function parseArgs() {
    const args = process.argv.slice(2);

    if (args.length < 1 || helpArgs.some(help => args.includes(help))) {
        console.log(usage);
        process.exit(0);
    }

    const inputPath = args[0] ?? "./input.png",
        filterPath = args[1] ?? "./filter.png",
        outputPath = args[2] ?? "./output.png";

    const offsetX = parseInt(args[3] ?? "0", 10),
        offsetY = parseInt(args[4] ?? "0", 10);

    if (!inputPath || !filterPath || !outputPath) {
        console.error("ERROR: No input paths provided.");
        console.log(usage);

        process.exit(1);
    }

    if (Number.isNaN(offsetX) || Number.isNaN(offsetY)) {
        console.error("ERROR: offsetX and offsetY must be valid integers.");
        console.log(usage);

        process.exit(1);
    }

    return {
        inputPath: inputPath,
        filterPath: filterPath,
        outputPath: outputPath,
        offsetX,
        offsetY
    };
}

async function main() {
    const args = parseArgs();

    const [input, inputW, inputH] = await ImgUtil.readImgPNG(args.inputPath).catch(() => process.exit(1)),
        [filter, filterW, filterH] = await ImgUtil.readImgPNG(args.filterPath).catch(() => process.exit(1));

    const tilesX = Math.ceil(inputW / filterW),
        tilesY = Math.ceil(inputH / filterH);

    const output = ImgUtil.allocImgBuffer(tilesX, tilesY);

    for (let y = 0; y < tilesY; y++) {
        for (let x = 0; x < tilesX; x++) {
            const baseX = x * filterW + args.offsetX,
                baseY = y * filterH + args.offsetY;

            const match = compareTile(input, inputW, inputH, filter, filterW, filterH, baseX, baseY),
                color = match ? [255, 255, 255] : [0, 0, 0];

            ImgUtil.setImgPixel(output, x, y, tilesX, tilesY, color);
        }
    }

    await ImgUtil.saveImgPNG(args.outputPath, output, tilesX, tilesY).catch(() => process.exit(1));
    console.log(`Output saved: ${args.outputPath} (${tilesX}x${tilesY})`);
}

main();
