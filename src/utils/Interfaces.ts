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
    createdAt: number;
    createdBy: string;
    lastChanged: number;
    lastChangedBy: string;
    status: 'queued' | 'active' | 'done' | 'error';
    data: {
        redisKey: string;
        extension: string;
        userId: string;
        projectId: string;
        organisationId: string;
        traceId: string;
        disableSensitiveLogging: boolean;
    };
    failReason: string | null;
    name: string;
    lastRunAt: string;
    lastFinishedAt: string | null;
    currentStep: number;
    totalStep: number;
}