import axios, { AxiosRequestHeaders, AxiosResponse } from "axios";
import { readFileSync, existsSync } from "fs";
import { basename, resolve } from "path";
import FormData = require("form-data")
import * as dotenv from "dotenv";
import https from 'https';
import { Config, NewConfig, ProjectConfig, ITask, CognigyItem } from "../utils/Interfaces";
dotenv.config({ path: '../.env' });

type CommandLineArguments = {
    configPath: string,
    project: string
};

export default class UploadController {
    private config: ProjectConfig;
    private extensionPath: string;
    private baseHeaders: AxiosRequestHeaders;
    private axiosAgent: https.Agent;
    private extensionName: string;
    private rootPath: string;
    private isDevEnvironment: boolean;

    constructor() {
        this.extensionPath = '';
        this.config = [];
        this.baseHeaders = {}
        this.axiosAgent = new https.Agent();
        this.rootPath = ''
        this.extensionName = '';
        this.isDevEnvironment = false
    }

    private setEnvironment(): void {
        this.isDevEnvironment = process.argv.indexOf('--dev') !== -1
    }

    private setAxiosAgent(): void {
        this.setEnvironment()
        if (this.isDevEnvironment) {
            this.axiosAgent = new https.Agent({
                rejectUnauthorized: false
            })
            return;
        }
        this.axiosAgent = new https.Agent();
    }

    private getCommandLineArguments(): CommandLineArguments {
        const arg = process.argv.slice(2)
        return {
            configPath: arg[0],
            project: arg[1]
        }
    }

    loadConfig(): void {
        this.isArg() // Check if there are CLI arguments present
        this.setAxiosAgent() // Set the axios agent based on '--dev' cli flag

        const arg = process.argv.slice(2)
        const params = this.getCommandLineArguments()

        const config = this.getConfigFile(params.configPath)

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

        // @ts-ignore
        this.config = this.addApiKeys()
        this.extensionName = this.getExtensionName()
        this.rootPath = this.getRootPath()
        this.extensionPath = this.getExtensionPath()
    }

    private isArg() {
        if (process.argv.length <= 2) {
            console.log("You should provide 2 arguments: a config file, and the project name from the config file (eg.: npm run <script> config.json project-name)")
            process.exit(1)
        }
    }

    private getExtensionName() {
        const absPackageJsonPath = resolve('package.json');
        if (!existsSync(absPackageJsonPath)) {
            console.log("package.json file not found")
            process.exit(1)
        }
        const rawPackageJson = readFileSync(absPackageJsonPath, 'utf-8')
        const packageJson = JSON.parse(rawPackageJson)
        return packageJson.name
    }

    private getConfigFile(relativeConfigPath: string): NewConfig {
        const absConfigPath = resolve(relativeConfigPath);
        if (!existsSync(absConfigPath)) {
            console.log("Config file not found")
            process.exit(1)
        }
        const rawConfigFile = readFileSync(absConfigPath, 'utf-8')
        const config = JSON.parse(rawConfigFile)
        return config
    }

    private addApiKeys() {
        // Check if there is C_API_KEY for the first project.
        // If yes, then return the config object intact
        if (this.config[0][1].C_API_KEY) {
            return this.config
        }
        // If not, then re-write the config object so that it has C_API_KEY from env variables
        return this.config.map(project => {
            return [project[0], {
                ...project[1],
                C_API_KEY: this.getApiKeyForProject(project[0])
            }]
        })
    }

    private getApiKeyForProject(projectName: string): string | undefined {
        const apiKey = process.env?.[`${projectName}_API_KEY`]
        if (apiKey) {
            console.log(`Api key retrieved successfully for project ${projectName}`)
            return apiKey
        }
        console.log(`There is no api key for this project. Environment variable ${projectName}_API_KEY is expected.`)
        process.exit(1)
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
        try {
            return await axios.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/upload`, extensionFile, {
                headers: {
                    ...this.baseHeaders,
                    'Content-Type': 'multipart/form-data'
                },
                httpsAgent: this.axiosAgent
            })
        } catch (err: any) {
            console.log(`\nFailed to create upload task for ${projectName}`, err.response.data);
            return err
        }
    }

    public async updateExtension(projectName: string, extensionFile: FormData): Promise<AxiosResponse<ITask>> {
        console.log(`Update extension in ${projectName}`)
        try {
            return await axios.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/update`, extensionFile, {
                headers: {
                    ...this.baseHeaders,
                    'Content-Type': 'multipart/form-data'
                },
                httpsAgent: this.axiosAgent
            })
        } catch (err: any) {
            console.log(`\nFailed to create update task ${projectName}`, err.response.data);
            return err
        }
    }

    public async taskCompletion() {
        const taskPromises = this.config.map(async project => {

            let { data } = await this.isTaskCompleted(project[1].TASK!._id, project[1].C_API_KEY)

            const startTime = Date.now()

            while (data.status !== 'done') {
                if (data.status === 'error') {
                    console.log('\nTask with id', data._id, 'failed. Metadata:', data);
                    return {
                        project: project[0],
                        task: project[1].TASK!._id
                    }
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

            return null
        })

        const extensionId = await this.getExtensionId(project)
        console.log(`Trusting extension ${extensionId} for ${project[0]}`);
        try {
            const results = await Promise.all(taskPromises);
            const failedTasks = results.filter(task => task !== null);
            if (failedTasks.length > 0) {
                console.log('Failed tasks:', failedTasks);
            } else {
                console.log('All tasks completed successfully.');
            }
        } catch (err) {
            console.log('Error occurred while waiting for all tasks to complete:', err);
        }

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

