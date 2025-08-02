declare class RefError extends Error {
    ref: any;
    constructor(message?: string, ref?: any, ...args: any[]);
}

export declare class ClientError extends RefError {}
export declare class ChessError extends RefError {}

export const enum MoveTypes {
    MOVE_TYPE_NORMAL = 0,
    MOVE_TYPE_CASTLE = 1,
    MOVE_TYPE_EN_PASSANT = 2
}

export const enum PieceTypes {
    PIECE_TYPE_PAWN = 0,
    PIECE_TYPE_KNIGHT = 1,
    PIECE_TYPE_BISHOP = 2,
    PIECE_TYPE_ROOK = 3,
    PIECE_TYPE_QUEEN = 4,
    PIECE_TYPE_KING = 5,
    PIECE_TYPE_PROMOTED_PAWN = 6
}
export type PieceTypeShort = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king" | "promoted_pawn";

export const enum PieceColors {
    black = "black",
    white = "white"
}
export type PieceColor = (typeof PieceColors)[keyof typeof PieceColors];

interface IPieceData {
    id: number;
    type: PieceTypes;
    isWhite: boolean;
    justDoubleMoved: boolean;
    kingKiller: boolean;
    kingPawner: boolean;
    queenKiller: boolean;
    queenPawner: boolean;
    adoptedKiller: boolean;
    adopted: boolean;
    hasCapturedPieceTypeOtherThanOwn: boolean;
    moveCount: number;
    captureCount: number;
}

export declare class Piece {
    static maxMoveDistance: number;

    static symbols: {
        empty: string;
        [key: number]: { white: string; black: string };
    };

    x: number;
    y: number;

    symbol: string;

    color: PieceColor;

    _type: number;
    type: PieceTypeShort;

    constructor(x: number, y: number, data: IPieceData);

    canMoveTo(x: number, y: number, moveType?: MoveTypes): boolean;

    move(x: number, y: number, floor?: boolean): void;
    capture(x: number, y: number, floor?: boolean): void;

    toString(): string;
}

export declare class Board extends Map<string, Piece> {
    static boardSize: number;
    static boardCount: number;

    static totalSize: number;

    static minPieceCoords: number;
    static maxPieceCoords: number;

    static minPiece: [number, number];
    static maxPiece: [number, number];

    static minCenterCoords: number;
    static maxCenterCoords: number;

    static minCenter: [number, number];
    static maxCenter: [number, number];

    static pieceInBounds(x: number, y: number): boolean;
    static centerInBounds(x: number, y: number): boolean;

    static getBoardCorner(x: number, y: number): [number, number];

    static distance(x1: number, y1: number, x2: number, y2: number, floor?: boolean): number;

    length: number;
    radius: number;

    centerX: number;
    centerY: number;

    leftX: number;
    topY: number;
    rightX: number;
    bottomY: number;

    constructor(centerX: number, centerY: number, length?: number);
    constructor(center: [number, number], length?: number);

    pieceInBounds(piece: Piece): boolean;
    pieceInBounds(x: number, y: number): boolean;

    has(key: string): boolean;
    has(x: number, y: number, validate?: boolean): boolean;

    get(key: string): Piece | undefined;
    get(x: number, y: number, validate?: boolean): Piece | null;

    set(key: string, piece: Piece | IPieceData): this;
    set(x: number, y: number, piece: Piece | IPieceData, validate?: boolean): this;

    delete(key: string): boolean;
    delete(x: number, y: number, validate?: boolean): boolean;

    getById(id: number): Piece | null;

    find(type?: PieceTypes | PieceTypeShort | null, color?: PieceColor | number | null): Piece | null;
    findInArea(
        type: PieceTypes | PieceTypeShort | null,
        color: PieceColor | number | null,
        x: number,
        y: number,
        w: number,
        h: number
    ): Piece | null;
    findInBoard(
        type: PieceTypes | PieceTypeShort | null,
        color: PieceColor | number | null,
        x: number,
        y: number
    ): Piece | null;

    movePiece(piece: Piece, toX: number, toY: number, capture?: boolean, validate?: boolean): Piece;
    moveFromPosition(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        capture?: boolean,
        validate?: boolean
    ): Piece;
    moveWithId(id: number, toX: number, toY: number, capture?: boolean, validate?: boolean): Piece;

    capturePiece(piece: Piece, validate?: boolean): Piece;
    captureOnPosition(x: number, y: number, validate?: boolean): Piece;
    captureWithId(id: number, validate?: boolean): Piece;

    clear(): void;

    entries(): Iterable<[[number, number], Piece]>;
    keys(): Iterable<[number, number]>;

    toString(pretty = true): string;
}

type ChessClientOptions = {
    k?: number;
    defaultJitter?: number;
    maxRPS?: number;
    reconnectDelay?: number;
    retryDelay?: number;
    maxRetryCount?: number;
};

export declare class ChessClient {
    static UserAgent: string;
    static Cookies: Record<string, string>;

    static maxConnections: number;
    static minViewDist: number;

    static delay(ms: number): Promise<void>;

    static getHttpsUrl(): string;
    static getServerUrl(x0: number, y0: number, colorPref: PieceColor): string;

    url: string;
    options: ChessClientOptions;

    k: number;

    defaultJitter: number;
    maxRPS: number;

    reconnectDelay: number;
    autoReconnect: boolean;

    retryDelay: number;
    maxRetryCount: number;
    enableRetry: number;

    x0: number;
    y0: number;
    colorPref: number;

    board: Board;

    totalMoves: number;
    totalCaptures: number;

    connected: boolean;
    destroyed: boolean;

    constructor(x0: number, y0: number, color: PieceColor, options?: ChessClientOptions);
    constructor(coords: [number, number], color: PieceColor, options?: ChessClientOptions);

    log(level: string, ...data: any): void;
    log(...data: any): void;

    init(): Promise<void>;

    sendRequest(msg: object): Promise<void>;

    movePiece(piece: Piece, toX: number, toY: number, type?: MoveTypes): Promise<{ moveToken: number }>;
    moveView(centerX: number, centerY: number): Promise<void>;

    disconnect(): void;
    destroy(): void;
}
