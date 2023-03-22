import axios, { AxiosRequestHeaders } from "axios";
import { readFileSync, existsSync } from "fs";
import { basename, resolve } from "path";
import FormData = require("form-data")
const untar = require("untar-to-memory");
import * as dotenv from "dotenv";
import https from 'https';
import { CognigyMeta, Config, ITask } from "../utils/Interfaces";
dotenv.config({ path: '../.env' });

export default class UploadController {
    private apiKey: string | undefined;
    private projectId: string | undefined;
    private extensionPath: string | undefined;
    private extensionMeta: CognigyMeta;
    private baseHeaders: AxiosRequestHeaders;
    private task: ITask;
    private axiosAgent: https.Agent;
    private extensionName: string;
    private rootPath: string;

    constructor() {
        this.apiKey = '';
        this.projectId = '';
        this.extensionPath = '';
        this.extensionMeta = {} as CognigyMeta;
        this.baseHeaders = {}
        this.task = {} as ITask
        this.axiosAgent = new https.Agent({
            rejectUnauthorized: false
        });
        this.rootPath = ''
        this.extensionName = '';
    }

    loadConfig(): void {
            this.isArg()

            const arg = process.argv.slice(2)
            const params = {
                configPath: arg[0],
                name: arg[1]
            }

            const config = this.getConfigFile(params.configPath)
            this.apiKey = config.C_API_KEY
            this.projectId = config.PROJECT_ID
            this.extensionName = params.name
            this.rootPath = this.getRootPath()
            this.extensionPath = this.getExtensionPath()
    }

    private isArg() {
        if(process.argv.length <= 2) {
            console.log("You should provide 2 arguments: a config file and name of extension (eg.: npm run <script> config.json extension-name)")
            process.exit(1)
        }
    }

    private getConfigFile(relativeConfigPath: string): Config {
        const absConfigPath = resolve(relativeConfigPath);
        const rawConfigFile = readFileSync(absConfigPath, 'utf-8')
        const config = JSON.parse(rawConfigFile)
        if(config.C_API_KEY && config.PROJECT_ID) {
            return config
        }
        console.log("The config file is wrong")
        process.exit(1) 
    }

    private getExtensionPath() {
        const extensionPath = `${this.rootPath}/${this.extensionName}-extension.tar.gz`
        if(existsSync(extensionPath)) {
            return extensionPath
        } 
        console.log("Extension not found. Did you enter the correct name?")
        process.exit(1) 
    }

    private getRootPath(): string {
        const rootPath = resolve(process.argv.slice(2)[0]).split('/').slice(0,-1).join('/')
        return rootPath
    }

    private createBaseHeaders() {
        this.baseHeaders = {
            'X-API-Key': this.apiKey as string,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    }

    async isExtension(): Promise<boolean | Error> {
        this.createBaseHeaders()
        const headers: AxiosRequestHeaders = {
            ...this.baseHeaders
        }
        const url = `https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${this.projectId}&filter=${this.extensionName}`
        try {
            const isExtension = await axios.get(url, { headers, httpsAgent: this.axiosAgent })
            this.setExtensionMeta(isExtension.data)
            return !!isExtension.data.total
        } catch (err: any) {
            throw new Error(err)
        }
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
        const fileToUpload = this.readLocalExtension(this.extensionPath as string)
        const artifact = new FormData();
        artifact.append("projectId", this.projectId as string);
        if (this.isUpload()) {
            artifact.append("extension", this.extensionMeta.items[0]._id);
        }
        artifact.append("file", fileToUpload, {
            filename: basename(this.extensionPath as string) + "_CU"
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
                process.stdout.write(`\rElapsed time ${elapsedTime}s | ${this.task.currentStep}%`)
            } catch (err: any) {
                throw new Error(`\n${err}`)
            }
        }
        console.log("\nTask completed")

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
        const projectId = this.projectId as string
        const extensionMeta = await this.getExtensionMetadata(projectId, this.extensionName)

        console.log(`Trusting extension with ID ${extensionMeta._id}`);

        try {
            const updateReponse = await axios.patch(`https://api-eon.cognigy.cloud/new/v2.0/extensions/${extensionMeta._id}`, { trustedCode: true }, {
                headers: {
                    ...this.baseHeaders
                },
                httpsAgent: this.axiosAgent
            })
            if (updateReponse.status === 204) {
                console.log('Task completed');
            } else {
                throw new Error(updateReponse as any)
            }
        } catch (err: any) {
            throw new Error(err)
        }
    }

}

