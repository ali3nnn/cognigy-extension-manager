export interface CognigyItem {
    _id: string,
    name: string,
    version: string,
    imageUrlToken: string,
    description: string,
    trustedCode: true
}

export interface CognigyMeta {
    items: Array<CognigyItem>,
    total: number,
    previousCursor: null,
    nextCursor: null
}

export interface ITask {
    _id: string;
    status: string,
    type: string,
    parameters: {
        redisKey: string,
        fileName: string,
        extension: string,
        userId: string,
        projectId: string,
        organisationId: string,
        traceId: string,
        disableSensitiveLogging: boolean
    },
    createdAt: number,
    lastChangedAt: number,
    progress: number
}



export interface Config {
    C_API_KEY: string;
    PROJECT_ID: string;
    META?: CognigyItem[];
    UPDATE?: boolean;
    TASK?: ITask;
}

export interface NewConfig {
    [key: string]: {
        C_API_KEY: string;
        PROJECT_ID: string;
    }
}

export type ProjectConfig = Array<[string, Config]>