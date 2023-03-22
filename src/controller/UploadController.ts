import axios, { AxiosRequestHeaders } from "axios";
import { readFileSync } from "fs";
import { basename } from "path";
import FormData = require("form-data")
const untar = require("untar-to-memory");
import * as dotenv from "dotenv";
import https from 'https';
import { CognigyMeta, ITask } from "../utils/Interfaces";
dotenv.config({ path: '../.env' });

export default class UploadController {
    private apiKey: string | undefined;
    private projectId: string | undefined;
    private path: string | undefined;
    private extensionMeta: CognigyMeta;
    private baseHeaders: AxiosRequestHeaders;
    private task: ITask;
    private axiosAgent: https.Agent;

    constructor() {
        this.apiKey = process.env.C_API_KEY;
        this.projectId = process.env.PROJECT_ID;
        this.path = process.env.EXTENSION_PATH;
        this.extensionMeta = {} as CognigyMeta;
        this.baseHeaders = {}
        this.task = {} as ITask
        this.axiosAgent = new https.Agent({
            rejectUnauthorized: false
        });
    }

    loadConfigFile(): void | Error {
        const isEnvVariable = this.isEnvVariable()
        if (isEnvVariable) {
            return;
        } else {
            try {
                const pathToConfigFile = __dirname.split('/').slice(0, 5).join('/') + '/project.config.json'
                const rawConfigFile = readFileSync(pathToConfigFile, 'utf-8')
                const config = JSON.parse(rawConfigFile)
                this.apiKey = config.C_API_KEY
                this.projectId = config.PROJECT_ID
                this.path = config.EXTENSION_PATH
            } catch (err: any) {
                throw new Error(err)
            }
        }
    }

    private createBaseHeaders() {
        this.baseHeaders = {
            'X-API-Key': this.apiKey as string,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    }

    private isEnvVariable(): boolean {
        if (this.apiKey && this.projectId && this.path) {
            return true
        }
        return false
    }

    async isExtension(): Promise<boolean | Error> {
        this.createBaseHeaders()
        const headers: AxiosRequestHeaders = {
            ...this.baseHeaders
        }
        const extensionName = await this.getExtensionNameFromZip()
        const url = `https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${this.projectId}&filter=${extensionName}`
        try {
            const isExtension = await axios.get(url, { headers, httpsAgent: this.axiosAgent })
            this.setExtensionMeta(isExtension.data)
            return !!isExtension.data.total
        } catch (err: any) {
            throw new Error(err)
        }
    }

    private async getExtensionNameFromZip(): Promise<string | void> {
        return await new Promise<void>((accept, reject) => {
            untar.readEntry(this.path as string, "package.json", null, (error: Error, buff: Buffer) => {
                if (error) {
                    return reject(error);
                }
                const packageJson = JSON.parse(buff.toString("utf-8"));
                accept(packageJson.name);
            });
        });
    }

    private setExtensionMeta(meta: object) {
        this.extensionMeta = JSON.parse(JSON.stringify(meta))
    }

    public async uploadNewExtension() {
        console.log("Upload new extension")
        const extensionFile = this.buildArtifact()
        const response = await axios.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/upload`, extensionFile, {
            headers: {
                ...this.baseHeaders,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: this.axiosAgent
        });
        if (response.status === 202) {
            this.task = response.data
            await this.waitForTaskCompletion()
            await this.setTrustedExtension()
        } else {
            throw new Error("Task has not been created!")
        }
    }

    public async updateExtension() {
        console.log("Update existing extension")
        const extensionFile = this.buildArtifact()
        const response = await axios.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/update`, extensionFile, {
            headers: {
                ...this.baseHeaders,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: this.axiosAgent
        }).catch(err => { throw new Error(err) });
        if (response.status === 202) {
            this.task = response.data
            await this.waitForTaskCompletion()
            await this.setTrustedExtension()
        } else {
            throw new Error("Task has not been created!")
        }
    }

    private buildArtifact() {
        const fileToUpload = this.readLocalExtension(this.path as string)
        const artifact = new FormData();
        artifact.append("projectId", this.projectId as string);
        if (this.isUpload()) {
            artifact.append("extension", this.extensionMeta.items[0]._id);
        }
        artifact.append("file", fileToUpload, {
            filename: basename(this.path as string) + "_CU"
        });
        return artifact
    }

    private isUpload() {
        return !!this.extensionMeta.items.length
    }

    private readLocalExtension(path: string) {
        return readFileSync(path as string);
    }

    private async waitForTaskCompletion() {
        const startTime = Date.now()
        while (this.task.status !== 'done') {

            if (this.task.status === 'error') {
                console.log('task with id', this.task._id, 'failed. Metadata:', this.task);
                console.log('extension upload failed!');
                process.exit(1);
            }

            // sleep 1s
            await new Promise<void>(a => setTimeout(() => a(), 1000));
            try {
                const { data } = await axios.get(`https://api-eon.cognigy.cloud/new/v2.0/tasks/${this.task._id}`, {
                    headers: this.baseHeaders,
                    httpsAgent: this.axiosAgent
                });
                this.task = data
                const elapsedTime = Math.round((Date.now() - startTime) / 1000)
                process.stdout.write(`\rElapsed time ${elapsedTime}s `)
            } catch (err: any) {
                throw new Error(`\n${err}`)
            }
        }
        console.log("\nUploading task completed")

    }

    private async getExtensionMetadata(projectId: string, extensionName: string) {
        try {
            const response = await axios.get(`https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${projectId}&filter=${extensionName}`, {
                headers: this.baseHeaders,
                httpsAgent: this.axiosAgent
            })
            return response.data.items[0]
        } catch (err: any) {
            throw new Error(err)
        }
    }

    private async setTrustedExtension() {
        const extensionName = await this.getExtensionNameFromZip() as string
        const projectId = this.projectId as string
        const extensionMeta = await this.getExtensionMetadata(projectId, extensionName)

        console.log(`Trusting extension with ID ${extensionMeta._id}`);

        try {
            const updateReponse = await axios.patch(`https://api-eon.cognigy.cloud/new/v2.0/extensions/${extensionMeta._id}`, { trustedCode: true }, {
                headers: {
                    ...this.baseHeaders
                },
                httpsAgent: this.axiosAgent
            })
            if (updateReponse.status === 204) {
                console.log('Extension uploaded successfully!');
            } else {
                throw new Error(updateReponse as any)
            }
        } catch (err: any) {
            throw new Error(err)
        }
    }

}

