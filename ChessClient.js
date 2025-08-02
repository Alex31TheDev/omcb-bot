"use strict";

const WebSocket = require("ws");
const fzstd = require("fzstd");

const { chess } = require("./chess.js");
const {
    PieceType: PieceTypes,
    MoveType: MoveTypes,

    ServerMessage,
    ClientMessage,
    PieceDataShared
} = chess;

class CustomError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

class RefError extends CustomError {
    constructor(message = "", ref, ...args) {
        super(message, ...args);

        this.ref = ref;
    }
}

class ClientError extends RefError {}
class ChessError extends ClientError {}

const PieceColors = Object.freeze({
    black: "black",
    white: "white"
});

class Piece {
    static maxMoveDistance = 25;

    static symbols = {
        empty: "·",

        [PieceTypes.PIECE_TYPE_PAWN]: { white: "♙", black: "♟" },
        [PieceTypes.PIECE_TYPE_KNIGHT]: { white: "♘", black: "♞" },
        [PieceTypes.PIECE_TYPE_BISHOP]: { white: "♗", black: "♝" },
        [PieceTypes.PIECE_TYPE_ROOK]: { white: "♖", black: "♜" },
        [PieceTypes.PIECE_TYPE_QUEEN]: { white: "♕", black: "♛" },
        [PieceTypes.PIECE_TYPE_KING]: { white: "♔", black: "♚" },
        [PieceTypes.PIECE_TYPE_PROMOTED_PAWN]: { white: "♕", black: "♛" }
    };

    constructor(x, y, data) {
        this._move(x, y);
        data = PieceDataShared.toObject(data, { defaults: true });

        this._type = data.type;
        this._color = Number(data.isWhite);

        delete data.type;
        delete data.isWhite;

        Object.assign(this, data);
    }

    get type() {
        return Piece._typeToShort(PieceTypes[this._type]);
    }

    set type(val) {
        this._type = Piece._getTypeNum(val);
    }

    get color() {
        return Piece._numToColor(this._color);
    }

    set color(val) {
        this._color = Piece._getColorNum(val);
    }

    get symbol() {
        return Piece.symbols[this._type][this.color];
    }

    canMoveTo(x, y, moveType = MoveTypes.MOVE_TYPE_NORMAL) {
        const x1 = this.x,
            y1 = this.y,
            x2 = Math.floor(x),
            y2 = Math.floor(y);

        const dist = Board.distance(x1, y1, x2, y2, false);
        if (dist > Piece.maxMoveDistance) return false;

        const dx = x2 - x1,
            dy = y2 - y1;

        if (dx === 0 && dy === 0) return false;

        switch (moveType) {
            case MoveTypes.MOVE_TYPE_NORMAL:
                break;

            case MoveTypes.MOVE_TYPE_CASTLE:
                if (this._type !== PieceTypes.PIECE_TYPE_KING) return false;
                return Math.abs(dx) === 2 && dy === 0;

            case MoveTypes.MOVE_TYPE_EN_PASSANT:
                if (this._type !== PieceTypes.PIECE_TYPE_PAWN) return false;
        }

        switch (this._type) {
            case PieceTypes.PIECE_TYPE_PAWN:
                const firstMove = this.moveCount < 1;

                let direction;

                if (this._color === 0) direction = 1;
                else if (this._color === 1) direction = -1;

                if (dx === 0) return dy === direction || (firstMove && dy === 2 * direction);
                else if (Math.abs(dx) === 1 && dy === direction) return true;
                else return false;

            case PieceTypes.PIECE_TYPE_KNIGHT:
                const d1 = Math.abs(dx) === 2 && Math.abs(dy) === 1,
                    d2 = Math.abs(dx) === 1 && Math.abs(dy) === 2;

                return d1 || d2;

            case PieceTypes.PIECE_TYPE_BISHOP:
                return Math.abs(dx) === Math.abs(dy);

            case PieceTypes.PIECE_TYPE_ROOK:
                return dx === 0 || dy === 0;

            case PieceTypes.PIECE_TYPE_QUEEN:
            case PieceTypes.PIECE_TYPE_PROMOTED_PAWN:
                return dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);

            case PieceTypes.PIECE_TYPE_KING:
                return dist === 1;
        }
    }

    move(x, y, floor = true) {
        this._move(x, y, floor);
        this.moveCount++;
    }

    capture(x, y, floor = true) {
        this._move(x, y, floor);
        this.captureCount++;
    }

    static _typePrefix = "PIECE_TYPE_";
    static _validColors = Object.values(PieceColors);

    static _validateTypeStr(str) {
        if (typeof PieceTypes[str] !== "number") {
            throw new ChessError("Invalid piece type: " + str, str);
        }
    }

    static _validateTypeNum(num) {
        if (typeof PieceTypes[num] !== "string") {
            throw new ChessError("Invalid piece type: " + num, num);
        }
    }

    static _typeToShort(type, validate = false) {
        if (validate) this._validateTypeStr(type);
        return type.slice(Piece._typePrefix.length).toLowerCase();
    }

    static _shortToType(short, validate = false) {
        const type = Piece._typePrefix + short.toUpperCase();
        if (validate) this._validateTypeStr(type);

        return type;
    }

    static _getTypeNum(val) {
        switch (typeof val) {
            case "number":
                Piece._validateTypeNum(val);
                return val;
            case "string":
                const str = Piece._shortToType(val, true);
                return PieceTypes[str];
            default:
                throw new ChessError("Invalid type value");
        }
    }

    static _validateColorStr(str) {
        if (!Piece._validColors.includes(str)) {
            throw new ChessError("Invalid color: " + str, str);
        }
    }

    static _validateColorNum(num) {
        if (num < 0 || num >= Piece._validColors.length) {
            throw new ChessError("Invalid color: " + num, num);
        }
    }

    static _colorToNum(color, validate = false) {
        if (validate) this._validateColorStr(color);
        return Piece._validColors.indexOf(color);
    }

    static _numToColor(num, validate = false) {
        if (validate) this._validateColorNum(num);
        return Piece._validColors[num];
    }

    static _getColorNum(val) {
        switch (typeof val) {
            case "number":
                Piece._validateColorNum(val);
                return val;
            case "string":
                return Piece._colorToNum(val, true);
            default:
                throw new ChessError("Invalid color value");
        }
    }

    _move(x, y, floor) {
        this.x = floor ? Math.floor(x) : x;
        this.y = floor ? Math.floor(y) : y;
    }

    toString() {
        const filtered = Object.fromEntries(Object.entries(this).filter(([key]) => !key.startsWith("_")));

        return JSON.stringify({
            ...filtered,
            type: this.type,
            color: this.color,
            symbol: this.symbol
        });
    }
}

class Board extends Map {
    static boardSize = 8;
    static boardCount = 1000 * 1000;

    static totalSize = this.boardSize * Math.sqrt(this.boardCount);

    static minPieceCoords = 0;
    static maxPieceCoords = this.totalSize - 1;

    static minPiece = [this.minPieceCoords, this.minPieceCoords];
    static maxPiece = [this.maxPieceCoords, this.maxPieceCoords];

    static minCenterCoords = this.boardSize / 4;
    static maxCenterCoords = this.totalSize - this.boardSize / 2 + 1;

    static minCenter = [this.minCenterCoords, this.minCenterCoords];
    static maxCenter = [this.maxCenterCoords, this.maxCenterCoords];

    static pieceInBounds(x, y) {
        return (
            x >= this.minPieceCoords && y >= this.minPieceCoords && x <= this.maxPieceCoords && y <= this.maxPieceCoords
        );
    }

    static centerInBounds(x, y) {
        return (
            x >= this.minCenterCoords &&
            y >= this.minCenterCoords &&
            x <= this.maxCenterCoords &&
            y <= this.maxCenterCoords
        );
    }

    static getBoardCorner(x, y) {
        const newX = Math.floor(x / Board.boardSize) * Board.boardSize,
            newY = Math.floor(y / Board.boardSize) * Board.boardSize;

        return [newX, newY];
    }

    static distance(x1, y1, x2, y2, floor = true) {
        if (floor) {
            x1 = Math.floor(x1);
            y1 = Math.floor(y1);
            x2 = Math.floor(x2);
            y2 = Math.floor(y2);
        }

        const dx = x2 - x1,
            dy = y2 - y1;

        return Math.max(Math.abs(dx), Math.abs(dy));
    }

    constructor(centerX, centerY, length) {
        if (Array.isArray(centerX)) {
            const coords = centerX;

            length = centerY;
            [centerX, centerY] = coords;
        }

        Board._validateCenterCoords(centerX, centerY);
        super();

        this.length = length ?? 95;
        this.radius = Math.floor((this.length - 1) / 2);

        this._initCoords();
        this._setCoords(centerX, centerY);
    }

    get centerX() {
        return this._centerX;
    }

    set centerX(val) {
        Board._validateCenterCoords(val, null);
        this._setCoords(val, null);
    }

    get centerY() {
        return this._centerY;
    }

    set centerY(val) {
        Board._validateCenterCoords(null, val);
        this._setCoords(null, val);
    }

    pieceInBounds(x, y) {
        if (x instanceof Piece) {
            const piece = x;
            x = piece.x;
            y = piece.y;
        }

        return Board.pieceInBounds(x, y) && this._pieceInBounds(x, y);
    }

    has(x, y, validate) {
        let key;

        if (typeof x === "string") key = x;
        else {
            if (validate && !this.pieceInBounds(x, y)) return false;
            key = Board._getCoordsKey(x, y, validate);
        }

        return super.has(key);
    }

    get(x, y, validate = true) {
        if (typeof x === "string") {
            const key = x;
            return super.get(key);
        } else {
            if (validate && !this.pieceInBounds(x, y)) return null;

            const key = Board._getCoordsKey(x, y, validate);
            return super.get(key) ?? null;
        }
    }

    set(x, y, piece, validate = true) {
        let key;

        if (typeof x === "string") {
            key = x;
            [x, y] = Board._getKeyCoords(key);
        } else {
            if (validate && !this.pieceInBounds(x, y)) return this;
            key = Board._getCoordsKey(x, y, validate);
        }

        if (!(piece instanceof Piece)) {
            piece = new Piece(x, y, piece);
        }

        return super.set(key, piece);
    }

    delete(x, y, validate = true) {
        let key;

        if (typeof x === "string") key = x;
        else {
            if (x instanceof Piece) {
                const piece = x;

                x = piece.x;
                y = piece.y;
            } else if (validate && !this.pieceInBounds(x, y)) return false;
            key = Board._getCoordsKey(x, y, validate);
        }

        return super.delete(key);
    }

    getById(id) {
        for (const piece of this.values()) {
            if (piece.id === id) return piece;
        }

        return null;
    }

    find(type, color) {
        let checkType, checkColor;
        ({ checkType, checkColor, type, color } = Board._getFindParams(type, color));

        for (const piece of this.values()) {
            const typeMatches = !checkType || piece._type === type,
                colorMatches = !checkColor || piece._color === color;

            if (typeMatches && colorMatches) return piece;
        }

        return null;
    }

    findInArea(type, color, x, y, w, h) {
        let checkType, checkColor;
        ({ checkType, checkColor, type, color } = Board._getFindParams(type, color));

        const x1 = x,
            y1 = y,
            x2 = x1 + w - 1,
            y2 = y1 + h - 1;

        if (w <= 0 || h <= 0) return null;
        if (!this.pieceInBounds(x1, y1) || !this.pieceInBounds(x2, y2)) return null;

        for (const [pos, piece] of this.entries()) {
            const typeMismatch = checkType && piece._type !== type,
                colorMismatch = checkColor && piece._color !== color;

            if (typeMismatch || colorMismatch) continue;

            const [a, b] = pos;

            if (a >= x1 && b >= y1 && a <= x2 && b <= y2) {
                return piece;
            }
        }

        return null;
    }

    findInBoard(type, color, x, y) {
        const [x1, y1] = Board.getBoardCorner(x, y);

        let w, h;
        w = h = Board.boardSize;

        return this.findInArea(type, color, x1, y1, w, h);
    }

    movePiece(piece, toX, toY, type, capture = false, validate = true) {
        if (validate) {
            if (piece == null) {
                throw new ChessError("No piece provided");
            }

            this._validatePieceMove(piece, toX, toY, type);
        }

        this.delete(piece?.x, piece?.y, validate);

        if (capture || this.has(toX, toY, validate)) {
            piece.capture(toX, toY, validate);
        } else {
            piece.move(toX, toY, validate);
        }

        this.set(toX, toY, piece, validate);
        return piece;
    }

    moveFromPosition(fromX, fromY, ...args) {
        return this._performAction(() => this.get(fromX, fromY), this.movePiece, args, 5);
    }

    moveWithId(id, ...args) {
        return this._performAction(() => this.getById(id), this.movePiece, args, 5);
    }

    capturePiece(piece, validate = true) {
        if (validate && piece == null) {
            throw new ChessError("No piece provided");
        }

        this.delete(piece?.x, piece?.y, validate);
        return piece;
    }

    captureOnPosition(x, y, ...args) {
        return this._performAction(() => this.get(x, y), this.capturePiece, args, 1);
    }

    captureWithId(id, ...args) {
        return this._performAction(() => this.getById(id), this.capturePiece, args, 1);
    }

    clear() {
        super.clear();
        this._initCoords();
    }

    *entries() {
        for (const [key, piece] of super.entries()) {
            yield [Board._getKeyCoords(key), piece];
        }
    }

    *keys() {
        for (const key of super.keys()) {
            yield Board._getKeyCoords(key);
        }
    }

    toString(pretty = true) {
        if (pretty) {
            if (this.size < 1) return "";

            const header =
                    " ".repeat(2) +
                    Array.from({ length: this.length }, (_, i) => (this.leftX + i).toString().padStart(2)).join(" "),
                out = [header];

            for (let y = this.topY; y <= this.bottomY; y++) {
                let row = `${y.toString().padStart(2)} `;

                for (let x = this.leftX; x <= this.rightX; x++) {
                    const piece = this.get(x, y);
                    row += (piece?.symbol ?? Piece.symbols.empty) + " ";
                }

                out.push(row);
            }

            return out.join("\n");
        } else {
            if (this.size < 1) return "{}";

            const out = Array.from(this.values())
                .map(piece => " ".repeat(4) + piece.toString())
                .join(",\n");

            return `[\n${out}\n]`;
        }
    }

    static _validateCenterCoords(x, y, msgType = "center") {
        const errors = [];

        if (x != null) {
            if (!Number.isInteger(x) || x < this.minCenterCoords || x > this.maxCenterCoords) {
                errors.push(`x=${x}`);
            }
        }

        if (y != null) {
            if (!Number.isInteger(y) || y < this.minCenterCoords || y > this.maxCenterCoords) {
                errors.push(`y=${y}`);
            }
        }

        if (errors.length < 1) {
            return;
        }

        let msg = "";

        switch (msgType) {
            case "center":
                const s = errors.length > 1 ? "s" : "";
                msg = `Invalid center coord${s}`;

                break;
            case "view":
                msg = "Can't move view to";
                break;
        }

        msg += ": " + errors.join(", ");

        const ref = {};
        if (x != null) ref.x0 = x;
        if (y != null) ref.y0 = y;

        throw new ChessError(msg, ref);
    }

    static _getCoordsKey(x, y, floor = true) {
        if (floor) {
            x = Math.floor(x);
            y = Math.floor(y);
        }

        return `${x},${y}`;
    }

    static _getKeyCoords(key) {
        return key
            .split(",")
            .map(x => Number.parseInt(x, 10))
            .slice(0, 2);
    }

    static _getFindParams(type, color) {
        const checkType = type != null,
            checkColor = color != null;

        if (checkType) type = Piece._getTypeNum(type);
        if (checkColor) color = Piece._getColorNum(color);

        return { checkType, checkColor, type, color };
    }

    _initCoords() {
        this._centerX = null;
        this._centerY = null;
        this.leftX = null;
        this.topY = null;
        this.rightX = null;
        this.bottomY = null;
    }

    _setCoords(x, y) {
        if (typeof x === "number") {
            this._centerX = x;
            this.leftX = Math.floor(x - this.radius);
            this.rightX = Math.ceil(x + this.radius);
        }

        if (typeof y === "number") {
            this._centerY = y;
            this.topY = Math.floor(y - this.radius);
            this.bottomY = Math.ceil(y + this.radius);
        }
    }

    _pieceInBounds(x, y) {
        return x >= this.leftX && y >= this.topY && x <= this.rightX && y <= this.bottomY;
    }

    _validatePieceMove(piece, toX, toY, type) {
        if (!this.pieceInBounds(piece)) {
            throw new ChessError("Can't move piece that's outside of board bounds", {
                x: piece.x,
                y: piece.y
            });
        }

        if (!this.pieceInBounds(toX, toY)) {
            throw new ChessError("Can't move piece to outside of board bounds", {
                toX,
                toY
            });
        }

        if (!piece.canMoveTo(toX, toY, type)) {
            throw new ChessError(`Can't move piece to: ${toX}, ${toY}`, {
                toX,
                toY
            });
        }
    }

    _performAction(getter, action, args, argsCount) {
        const piece = getter(),
            validate = args[argsCount - 1] ?? true;

        if (validate && piece === null) {
            throw new ChessError("No piece at starting position");
        }

        return action.apply(this, [piece].concat(args));
    }
}

class WsClient {
    static maxConnections = Infinity;

    static UserAgent = "";
    static Cookies = {};

    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    constructor(url, options = {}) {
        if (typeof url !== "string" || url.length < 1) {
            throw new ClientError("Invalid websocket URL provided");
        }

        this.url = url;
        this.options = options;

        this.k = options.k ?? null;

        this.defaultJitter = options.defaultJitter ?? 1000;
        this.maxRPS = options.maxRPS ?? Infinity;

        this.reconnectDelay = options.reconnectDelay ?? 1000;

        this.retryDelay = options.retryDelay ?? 1000;
        this.maxRetryCount = options.maxRetryCount ?? 5;
        this.enableRetry = this.retryDelay > 0 && this.maxRetryCount > 0;

        this._ws = null;
        this._connectionReady = Promise.resolve();

        this._tokens = this.maxRPS;
        this._lastRefillTime = Date.now();

        this._resetState();
    }

    log(level, ...data) {
        let func, args;

        if (WsClient._validConsoleLevels.includes(level)) {
            func = console[level];
            args = data;
        } else {
            func = console.log;
            args = [level].concat(data);
        }

        if (this.k !== null) args.unshift(`(${this.k}):`);
        func.apply(console, args);
    }

    async init() {
        this._resetState();
        await this._connect();
    }

    async sendRequest(data) {
        if (!this.enableRetry) return await this._attemptSend(data);
        return await this._sendWithRetry(data);
    }

    disconnect() {
        this.autoReconnect = false;
        this._onWebsocketClose();
    }

    destroy() {
        this.destroyed = true;
        this._onWebsocketClose();
    }

    static _validConsoleLevels = ["debug", "info", "log", "warn", "error"];

    static _createDeferred() {
        const deferred = { isResolved: false },
            setResolved = () => (deferred.isResolved = true);

        deferred.promise = new Promise((resolve, reject) => {
            deferred.resolve = resolve;
            deferred.reject = reject;
        }).then(setResolved, setResolved);

        return deferred;
    }

    static _getRetryTime(base, jitter, error) {
        const time = base + (Math.random() * jitter - jitter / 2);
        return error ? time * (1 + Math.random() * 0.4) : time;
    }

    static _connections = 0;

    static _increment() {
        if (this.maxConnections === Infinity) return;

        if (this._connections >= this.maxConnections) {
            throw new ClientError(`Maximum connections (${this.maxConnections}) exceeded for ${this.name}`);
        }

        this._connections++;
    }

    static _decrement() {
        if (this.maxConnections === Infinity) return;

        if (this._connections <= 0) {
            throw new ClientError("Connection count cannot be lower than 0");
        }

        this._connections--;
    }

    _setReconnecting() {
        this._reconnecting = true;
    }

    _resetReconnecting(success) {
        this._reconnecting = false;
        if (success) this._reconnectAttempts = 0;
    }

    _resetState() {
        this.connected = false;
        this.destroyed = false;

        this.autoReconnect = this.reconnectDelay > 0;
        this._resetReconnecting(true);
    }

    _getWebsocketHeaders() {
        const staticThis = this.constructor,
            headers = {};

        if (staticThis.UserAgent?.length > 0) {
            headers["User-Agent"] = staticThis.UserAgent;
        }

        if (typeof staticThis.Cookies === "object") {
            const cookies = Object.entries(staticThis.Cookies),
                query = cookies.filter(([, value]) => value?.length > 0).map(([key, value]) => `${key}=${value}`);

            headers["Cookie"] = query.join("; ");
        }

        return headers;
    }

    _initWebsocket() {
        const ws = new WebSocket(this.url, {
            headers: this._getWebsocketHeaders()
        });

        ws.binaryType = "arraybuffer";
        this._ws = ws;
    }

    _connect() {
        const promise = new Promise((resolve, reject) => {
            if (this.destroyed) {
                return reject(new ClientError("Client destroyed"));
            } else if (this.connected) {
                return resolve(this._connectionReady);
            }

            try {
                this.constructor._increment();
            } catch (err) {
                return reject(err);
            }

            this._setReconnecting();
            this._initWebsocket();

            this._ws.on("open", () => {
                this._resetReconnecting(true);
                this._onWebsocketOpen();

                resolve();
            });

            this._ws.on("message", data => this._onWebsocketMessage(data));

            this._ws.on("error", err => {
                this._resetReconnecting(false);
                this._onWebsocketError(err);

                reject(err);
            });

            this._ws.on("close", code => {
                this._resetReconnecting(false);
                this._onWebsocketClose(code);

                reject(new ClientError("Connection failed", code));
            });
        });

        this._connectionReady = promise;
        return promise;
    }

    async _attemptSend(data) {
        await this._connectionReady;
        await this._acquireToken();

        if (this.destroyed) {
            throw new ClientError("Client destroyed");
        }

        if (!this.connected) {
            throw new ClientError("Connection not open");
        }

        return new Promise((resolve, reject) => {
            this._ws.send(data, err => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async _sendWithRetry(data) {
        let retries = 0;

        while (true) {
            try {
                return await this._attemptSend(data);
            } catch (error) {
                if (error.message.includes("destoyed")) return;

                if (++retries > this.maxRetryCount) {
                    throw error;
                }

                const retryDelay = WsClient._getRetryTime(this.retryDelay, this.defaultJitter, false);
                await WsClient.delay(retryDelay);
            }
        }
    }

    async _acquireToken() {
        if (this.maxRPS === Infinity) return;

        while (true) {
            const now = Date.now(),
                elapsed = (now - this._lastRefillTime) / 1000;

            const toAdd = Math.floor(elapsed * this.maxRPS);

            if (toAdd > 0) {
                this._tokens = Math.min(this.maxRPS, this._tokens + toAdd);
                this._lastRefillTime = now;
            }

            if (this._tokens > 0) {
                this._tokens--;
                return;
            } else {
                const refillDelay = 1000 / this.maxRPS;
                await WsClient.delay(refillDelay);
            }
        }
    }

    _scheduleReconnect(wasError) {
        if (this._reconnecting || this.destroyed) return;
        if (++this._reconnectAttempts > this.maxRetryCount) return;

        const baseDelay = (this._reconnectAttempts * this.reconnectDelay) / 2,
            reconnectDelay = WsClient._getRetryTime(baseDelay, 5 * this.defaultJitter, wasError);

        this._reconnectTimeout = setTimeout(() => {
            this._connect().catch(err => {
                this.log("error", "ERROR: Reconnecting failed:");
                this.log("error", err);
            });
        }, reconnectDelay);
    }

    _handleDisconnect(code) {
        this.connected = false;
        this.constructor._decrement();

        this._connectionReady = Promise.resolve();
        this.log("Websocket closed with code:", code);

        this._rejectPendingRequests();
        this._clearTimers();

        this._cleanupSocket();

        if (this.autoReconnect) {
            const wasError = code !== 1000;
            this._scheduleReconnect(wasError);
        }
    }

    _cleanupSocket() {
        if (this._ws === null) return;

        this._ws.removeAllListeners();
        this._ws.close();
        this._ws = null;
    }

    _onWebsocketOpen() {
        this.connected = true;
        this.log("Websocket opened.");
    }

    _onWebsocketError(err) {
        this.log("error", "ERROR: Websocket error:");
        this.log("error", err);

        this._handleDisconnect(1006);
    }

    _onWebsocketClose(code = 1000) {
        this._handleDisconnect(code);
    }

    _onWebsocketMessage(data) {}

    _rejectPendingRequests() {}

    _clearTimers() {
        clearTimeout(this._reconnectTimeout);
        delete this._reconnectTimeout;
    }
}

class ChessClient extends WsClient {
    static maxConnections = 20;
    static minViewDist = 12;

    static getHttpsUrl() {
        return `https://${this._chessDomain}`;
    }

    static getServerUrl(x0, y0, colorPref) {
        return `wss://${this._chessDomain}/ws?x=${x0}&y=${y0}&colorPref=${colorPref}`;
    }

    constructor(x0, y0, color, options) {
        if (Array.isArray(x0)) {
            const coords = x0;

            options = color;
            color = y0;
            [x0, y0] = coords;
        }

        Piece._validateColorStr(color);
        Board._validateCenterCoords(x0, y0);

        super(ChessClient.getServerUrl(x0, y0, color), {
            defaultJitter: 4000,
            maxRPS: 2,
            reconnectDelay: 15000,
            ...(options ?? {})
        });

        this.x0 = x0;
        this.y0 = y0;
        this.colorPref = color;

        this.board = new Board();
        this.totalMoves = 0;
        this.totalCaptures = 0;

        this._moveToken = 0;
        this._pendingPieceMoves = new Map();
        this._pendingViewMove = null;

        this._boardReady = WsClient._createDeferred();
    }

    async init() {
        await super.init();
        await this._boardReady.promise;
    }

    async sendRequest(msg) {
        const encoded = ClientMessage.encode(msg).finish();
        return await super.sendRequest(encoded);
    }

    async movePiece(piece, toX, toY, type = MoveTypes.MOVE_TYPE_NORMAL) {
        if (piece === null) {
            throw new ChessError("No piece at starting position");
        }

        this.board._validatePieceMove(piece, toX, toY, type);

        if (typeof MoveTypes[type] !== "string") {
            throw new ChessError("Invalid move type: " + type, type);
        }

        const moveCoords = {
            fromX: piece.x,
            fromY: piece.y,
            toX: Math.floor(toX),
            toY: Math.floor(toY)
        };

        const moveToken = this._getIncrMoveToken(),
            message = {
                move: {
                    pieceId: piece.id,
                    ...moveCoords,

                    moveType: type,
                    moveToken
                }
            };

        return new Promise((resolve, reject) => {
            const pending = {
                resolve,
                reject,

                piece,
                ...moveCoords
            };

            this._pendingPieceMoves.set(moveToken, pending);

            pending.timeout = setTimeout(() => {
                this._pendingPieceMoves.delete(moveToken);
                reject(new ChessError("Move timed out: " + moveToken, moveToken));
            }, ChessClient._moveTimeout);

            this.sendRequest(message).catch(error => {
                clearTimeout(pending.timeout);
                this._pendingPieceMoves.delete(moveToken);

                reject(error);
            });
        });
    }

    async moveView(centerX, centerY) {
        if (this._pendingViewMove !== null) {
            throw new ChessError("Already waiting for view move");
        }

        Board._validateCenterCoords(centerX, centerY, "view");

        centerX = Math.floor(centerX);
        centerY = Math.floor(centerY);

        const dist = Board.distance(this.board.centerX, this.board.centerY, centerX, centerY, false);

        if (dist < ChessClient.minViewDist) {
            throw new ChessError(`Move distance ${dist} too short`, dist);
        }

        const moveCoords = {
            centerX: centerX,
            centerY: centerY
        };

        const message = {
            subscribe: {
                ...moveCoords
            }
        };

        return new Promise((resolve, reject) => {
            const pending = {
                resolve,
                reject
            };

            this._pendingViewMove = pending;

            pending.timeout = setTimeout(() => {
                this._pendingViewMove = null;
                reject(new ChessError("View move timed out"));
            }, 4 * ChessClient._moveTimeout);

            this.sendRequest(message).catch(error => {
                clearTimeout(pending.timeout);
                this._pendingViewMove = null;

                reject(error);
            });
        });
    }

    destroy() {
        super.destroy();

        this._rejectPendingRequests();
        this.board.clear();

        this.log(`Client destroyed.`);
    }

    static _chessDomain = "onemillionchessboards.com";

    static _pingInterval = 1200;
    static _pongTimeout = 20000;
    static _moveTimeout = 20000;

    static _zstdMagicBytes = [0x28, 0xb5, 0x2f, 0xfd];

    static _isZstdCompressed(data) {
        if (data.length < 4) {
            return false;
        }

        return this._zstdMagicBytes.every((byte, i) => data[i] === byte);
    }

    static _maxMoveToken = 2 ** 16 - 1;

    _resetBoard(snapshot) {
        const { xCoord: centerX, yCoord: centerY, pieces } = snapshot;

        this.board.clear();

        this.board.centerX = centerX;
        this.board.centerY = centerY;

        for (const { dx, dy, piece } of pieces) {
            const x = centerX + dx,
                y = centerY + dy;

            this.board.set(x, y, piece, false);
        }
    }

    _schedulePing() {
        clearTimeout(this._pingInterval);
        clearTimeout(this._pongTimeout);

        const pingDelay = ChessClient._getRetryTime(ChessClient._pingInterval, this.defaultJitter / 2, false);

        this._pingInterval = setTimeout(() => {
            const data = ClientMessage.encode({
                ping: {}
            }).finish();

            this._ws.send(data);

            this._pongTimeout = setTimeout(() => {
                this._handleDisconnect(1006);
            }, ChessClient._pongTimeout);
        }, pingDelay);
    }

    _connect() {
        this._boardReady = ChessClient._createDeferred();
        return super._connect();
    }

    _decompressData(data) {
        if (!ChessClient._isZstdCompressed(data)) return data;

        try {
            return fzstd.decompress(data);
        } catch (err) {
            this.log("error", "ERROR: Decompressing data failed:");
            this.log("error", err);

            return null;
        }
    }

    async _decodeMessage(data) {
        data = await this._decompressData(data);
        if (data === null) return null;

        try {
            return ServerMessage.decode(data);
        } catch (err) {
            this.log("error", "ERROR: Decoding message failed:");
            this.log("error", err);

            return null;
        }
    }

    async _handleServerMessage(msg) {
        if (msg === null) return null;

        const { payload } = msg,
            handlerFunc = this._messageHandlers[payload];

        if (typeof handlerFunc === "undefined") {
            console.warn("Unknown message type received:", payload);
            return;
        }

        try {
            await handlerFunc.call(this, msg[payload]);
        } catch (err) {
            this.log("error", "ERROR: Handling message failed:");
            this.log("error", err);
        }
    }

    _messageHandlers = {
        pong: () => {
            this._schedulePing();
        },

        initialState: data => {
            this._resetBoard(data.snapshot);
            this._boardReady.resolve();
        },

        snapshot: data => {
            this._resetBoard(data);

            const pending = this._pendingViewMove;

            if (pending !== null) {
                clearTimeout(pending.timeout);
                pending.resolve();

                this._pendingViewMove = null;
            }
        },

        validMove: data => {
            const { moveToken, capturedPieceId } = data;

            const pending = this._pendingPieceMoves.get(moveToken);
            if (typeof pending === "undefined") return;

            clearTimeout(pending.timeout);
            this._pendingPieceMoves.delete(moveToken);

            this.board.movePiece(pending.piece, pending.toX, pending.toY, undefined, false, false);

            this.totalMoves++;
            if (capturedPieceId) this.totalCaptures++;

            pending.resolve({ moveToken });
        },

        invalidMove: data => {
            const { moveToken } = data;

            const pending = this._pendingPieceMoves.get(moveToken);
            if (typeof pending === "undefined") return;

            clearTimeout(pending.timeout);
            this._pendingPieceMoves.delete(moveToken);

            pending.reject(new ChessError("Invalid move: " + moveToken, moveToken));
        },

        movesAndCaptures: data => {
            const { moves, captures } = data;

            for (const { capturedPieceId } of captures) {
                this.board.captureWithId(capturedPieceId, false);
            }

            for (const move of moves) {
                const { x, y, piece } = move;
                this.board.set(x, y, piece, false);
            }
        },

        bulkCapture: data => {
            const { capturedIds } = data;

            for (const capturedPieceId of capturedIds) {
                this.board.captureWithId(capturedPieceId, false);
            }
        }
    };

    _rejectPendingRequests() {
        for (const pending of this._pendingPieceMoves.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new ChessError("Connection closed"));
        }

        this._pendingPieceMoves.clear();

        const pending = this._pendingViewMove;

        if (this._pendingViewMove !== null) {
            clearTimeout(pending.timeout);
            pending.reject(new ChessError("Connection closed"));

            this._pendingViewMove = null;
        }
    }

    _onWebsocketOpen() {
        super._onWebsocketOpen();
        this._schedulePing();
    }

    async _onWebsocketMessage(data) {
        data = new Uint8Array(data);
        const message = await this._decodeMessage(data);
        await this._handleServerMessage(message);
    }

    _getIncrMoveToken() {
        if (this._moveToken >= ChessClient._maxMoveToken) {
            this._moveToken = 0;
        }

        this._moveToken++;
        return this._moveToken;
    }

    _clearTimers() {
        super._clearTimers();

        clearTimeout(this._pingInterval);
        clearTimeout(this._pongTimeout);

        delete this._pingInterval;
        delete this._pongTimeout;
    }
}

module.exports = {
    ChessError,

    Piece,
    Board,
    ChessClient,

    PieceTypes,
    PieceColors,
    MoveTypes
};
