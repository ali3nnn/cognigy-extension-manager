import axios, { AxiosRequestHeaders, AxiosResponse } from "axios";
import { readFileSync, existsSync } from "fs";
import { basename, resolve } from "path";
import FormData = require("form-data")
const untar = require("untar-to-memory");
import * as dotenv from "dotenv";
import https from 'https';
import { Config, NewConfig, ProjectConfig, ITask, CognigyItem } from "../utils/Interfaces";
dotenv.config({ path: '../.env' });

export default class UploadController {
    private config: ProjectConfig;
    private extensionPath: string;
    private baseHeaders: AxiosRequestHeaders;
    private axiosAgent: https.Agent;
    private extensionName: string;
    private rootPath: string;

    constructor() {
        this.extensionPath = '';
        this.config = [];
        this.baseHeaders = {}
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
            name: arg[1],
            project: arg[2]
        }

        const config = this.getNewConfigFile(params.configPath)
        if (params.project === 'all') {
            this.config = Object.entries(config)
        } else {
            this.config = Object.entries(config).filter(project => {
                if (project[0] === params.project) {
                    return true
                }
                return false
            })
        }

        if (this.config.length === 0) {
            console.log("Project not found.")
            process.exit(1)
        }

        this.extensionName = params.name
        this.rootPath = this.getRootPath()
        this.extensionPath = this.getExtensionPath()
    }

    private isArg() {
        if (process.argv.length <= 2) {
            console.log("You should provide 2 arguments: a config file and name of extension (eg.: npm run <script> config.json extension-name)")
            process.exit(1)
        }
    }

    private getNewConfigFile(relativeConfigPath: string): NewConfig {
        const absConfigPath = resolve(relativeConfigPath);
        if (!existsSync(absConfigPath)) {
            console.log("Config file not found")
            process.exit(1)
        }
        const rawConfigFile = readFileSync(absConfigPath, 'utf-8')
        const config = JSON.parse(rawConfigFile)
        return config
    }

    private getExtensionPath() {
        const extensionPath = `${this.rootPath}/${this.extensionName}-extension.tar.gz`
        if (existsSync(extensionPath)) {
            return extensionPath
        }
        console.log("Extension not found. Did you enter the correct name?")
        process.exit(1)
    }

    private getRootPath(): string {
        const rootPath = resolve(process.argv.slice(2)[0]).split('/').slice(0, -1).join('/')
        return rootPath
    }

    private createBaseHeaders(apiKey: string) {
        this.baseHeaders = {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
        return this.baseHeaders
    }

    public async uploadOrUpdateExtension() {
        await this.isUploadOrUpdate();

        const listOfProcessedProjects = Promise.all(this.config.map(async project => {
            const extensionFile = this.buildArtifact(project)
            this.createBaseHeaders(project[1].C_API_KEY)
            let response;
            if (project[1].UPDATE) {
                response = await this.updateExtension(project[0], extensionFile)
            } else {
                response = await this.uploadNewExtension(project[0], extensionFile)
            }
            return [
                project[0],
                {
                    ...project[1],
                    TASK: response.data
                }
            ]
        }))
        this.config = await listOfProcessedProjects as ProjectConfig
    }

    private async isUploadOrUpdate() {
        const config = Promise.all(this.config.map(async project => {
            this.createBaseHeaders(project[1].C_API_KEY)
            const isExtension = await this.isExtension(project[1].PROJECT_ID, project[0])
            project[1].META = isExtension
            project[1].UPDATE = isExtension.length ? true : false
            return project
        }))
        this.config = await config
        return this.config
    }

    private async isExtension(projectId: string, projectName: string): Promise<CognigyItem[]> {
        const headers: AxiosRequestHeaders = {
            ...this.baseHeaders
        }
        console.log(`Check if ${this.extensionName} exists in ${projectName}`)
        const url = `https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${projectId}&filter=${this.extensionName}`
        try {
            const isExtension = await axios.get(url, { headers, httpsAgent: this.axiosAgent })
            if (isExtension.data.total) {
                return isExtension.data.items
            }
            return []
        } catch (err: any) {
            throw new Error(err)
        }
    }

    private buildArtifact(project: [string, Config]): FormData {
        const fileToUpload = this.readLocalExtension(this.extensionPath)
        const artifact = new FormData();
        artifact.append("projectId", project[1].PROJECT_ID);
        if (project[1].UPDATE == true) {
            artifact.append("extension", project[1].META![0]._id);
        }
        artifact.append("file", fileToUpload, {
            filename: basename(this.extensionPath) + "_CU"
        });
        return artifact
    }

    private readLocalExtension(path: string) {
        return readFileSync(path as string);
    }

    private async uploadNewExtension(projectName: string, extensionFile: FormData): Promise<AxiosResponse<ITask>> {
        console.log(`Upload new extension in ${projectName}`)
        const response = await axios.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/upload`, extensionFile, {
            headers: {
                ...this.baseHeaders,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: this.axiosAgent
        }).catch(err => {
            console.log("\nFailed to check create upload task",err.response.data);
            process.exit(1)
        });

        return response
    }

    public async updateExtension(projectName: string, extensionFile: FormData): Promise<AxiosResponse<ITask>> {
        console.log(`Update extension in ${projectName}`)
        const response = await axios.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/update`, extensionFile, {
            headers: {
                ...this.baseHeaders,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: this.axiosAgent
        }).catch(err => {
            console.log("\nFailed to check create update task",err.response.data);
            process.exit(1)
        });

        return response
    }

    public async taskCompletion() {
        this.config.forEach(async project => {

            let { data } = await this.isTaskCompleted(project[1].TASK!._id, project[1].C_API_KEY)

            const startTime = Date.now()

            while (data.status !== 'done') {
                if (data.status === 'error') {
                    console.log('\nTask with id', data._id, 'failed. Metadata:', data);
                }

                await new Promise<void>(a => setTimeout(() => a(), 1000)); // sleep 1s

                try {
                    const response = await this.isTaskCompleted(project[1].TASK!._id, project[1].C_API_KEY)
                    data = response.data
                    const elapsedTime = Math.round((Date.now() - startTime) / 1000)
                    process.stdout.write(`\rElapsed time ${elapsedTime}s`)
                } catch (err: any) {
                    console.log("\nFailed to check task progress", err)
                }
            }

            console.log(`\nTask completed for project ${project[0]}`)

            await this.setTrustedExtension(project)
        })

    }

    private async isTaskCompleted(taskId: string, apiKey: string): Promise<any> {
        try {
            return await axios.get(`https://api-eon.cognigy.cloud/new/v2.0/tasks/${taskId}`, {
                headers: this.createBaseHeaders(apiKey),
                httpsAgent: this.axiosAgent
            });
        } catch (err: any) {
            console.log(`\n${err}`)
        }
    }

    private async getExtensionId(project: [string, Config]) {
        try {
            const response = await axios.get(`https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${project[1].PROJECT_ID}&filter=${this.extensionName}`, {
                headers: this.createBaseHeaders(project[1].C_API_KEY),
                httpsAgent: this.axiosAgent
            })
            return response.data.items[0]._id
        } catch (err: any) {
            console.log("Failed to get extension id", err)
        }
    }

    private async setTrustedExtension(project: [string, Config]) {

        const extensionId = await this.getExtensionId(project)
        console.log(`Trusting extension ${extensionId} for ${project[0]}`);
        try {
            const updateReponse = await axios.patch(`https://api-eon.cognigy.cloud/new/v2.0/extensions/${extensionId}`, { trustedCode: true }, {
                headers: {
                    ...this.createBaseHeaders(project[1].C_API_KEY)
                },
                httpsAgent: this.axiosAgent
            })
            if (updateReponse.status === 204) {
                console.log(`Extension trusted for project ${project[0]}`);
            } else {
                console.log(`Failed to trust the extension for project ${project[0]}`);
                console.log(updateReponse.data)
            }
        } catch (err: any) {
            console.log("Failed to trust the extension", err)
        }


    }

}

