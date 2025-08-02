const fs = require("fs/promises");
const path = require("path");
const lodepng = require("lodepng");

function allocImgBuffer(width, height, initAlpha = false) {
    const buf = Buffer.alloc(4 * width * height, 0);

    if (initAlpha) {
        for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
    }

    return buf;
}

function readImgPixel(buf, x, y, width, height) {
    if (x < 0 || x >= width || y < 0 || y >= height) return null;
    const pos = 4 * (y * width + x);

    return buf.slice(pos, pos + 4);
}

function setImgPixel(buf, x, y, width, height, color) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pos = 4 * (y * width + x);

    buf[pos] = color[0] ?? 0;
    buf[pos + 1] = color[1] ?? 0;
    buf[pos + 2] = color[2] ?? 0;
    buf[pos + 3] = color[3] ?? 255;
}

function pixelsMatch(a, b) {
    for (let i = 0; i < 4; i++) {
        if (a[i] !== b[i]) return false;
    }

    return true;
}

function parsePath(filePath) {
    let fileDir;

    if (typeof filePath === "object") {
        const pathOpts = filePath;
        ({ filePath, fileDir } = pathOpts);
    }

    if (filePath == null || filePath.length < 1) {
        throw new TypeError("No file path provided");
    }

    filePath = path.resolve(fileDir || "", filePath);
    fileDir ||= path.dirname(filePath);

    return [filePath, fileDir];
}

async function readImgPNG(filePath) {
    [filePath] = parsePath(filePath);

    let buf, width, height;

    try {
        const imgData = await fs.readFile(filePath);
        ({ data: buf, width, height } = await lodepng.decode(imgData));
    } catch (err) {
        if (err.code === "ENOENT") {
            console.error(`ERROR: Image not found at path: "${filePath}".`);
        } else {
            console.error("ERROR: Occured while reading or decoding the image:");
            console.error(err);
        }

        throw err;
    }

    return [buf, width, height];
}

async function saveImgPNG(filePath, buf, width, height) {
    let fileDir;
    [filePath, fileDir] = parsePath(filePath);

    try {
        const pngData = await lodepng.encode({ data: buf, width, height });

        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(filePath, pngData);
    } catch (err) {
        console.error("ERROR: Occured while writing the image:");
        console.error(err);

        throw err;
    }

    return filePath;
}

module.exports = {
    allocImgBuffer,

    readImgPixel,
    setImgPixel,

    pixelsMatch,

    readImgPNG,
    saveImgPNG
};
