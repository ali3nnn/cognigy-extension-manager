"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const fs_1 = require("fs");
const path_1 = require("path");
const FormData = require("form-data");
const untar = require("untar-to-memory");
const dotenv = __importStar(require("dotenv"));
const https_1 = __importDefault(require("https"));
dotenv.config({ path: '../.env' });
class UploadController {
    constructor() {
        this.apiKey = '';
        this.projectId = '';
        this.extensionPath = '';
        this.extensionMeta = {};
        this.baseHeaders = {};
        this.task = {};
        this.axiosAgent = new https_1.default.Agent({
            rejectUnauthorized: false
        });
        this.rootPath = '';
        this.extensionName = '';
    }
    loadConfig() {
        this.isArg();
        const arg = process.argv.slice(2);
        const params = {
            configPath: arg[0],
            name: arg[1]
        };
        const config = this.getConfigFile(params.configPath);
        this.apiKey = config.C_API_KEY;
        this.projectId = config.PROJECT_ID;
        this.extensionName = params.name;
        this.rootPath = this.getRootPath();
        this.extensionPath = this.getExtensionPath();
    }
    isArg() {
        if (process.argv.length <= 2) {
            console.log("You should provide 2 arguments: a config file and name of extension (eg.: npm run <script> config.json extension-name)");
            process.exit(1);
        }
    }
    getConfigFile(relativeConfigPath) {
        const absConfigPath = (0, path_1.resolve)(relativeConfigPath);
        if (!(0, fs_1.existsSync)(absConfigPath)) {
            console.log("Config file not found");
            process.exit(1);
        }
        const rawConfigFile = (0, fs_1.readFileSync)(absConfigPath, 'utf-8');
        const config = JSON.parse(rawConfigFile);
        if (config.C_API_KEY && config.PROJECT_ID) {
            return config;
        }
        console.log("The config file is wrong");
        process.exit(1);
    }
    getExtensionPath() {
        const extensionPath = `${this.rootPath}/${this.extensionName}-extension.tar.gz`;
        if ((0, fs_1.existsSync)(extensionPath)) {
            return extensionPath;
        }
        console.log("Extension not found. Did you enter the correct name?");
        process.exit(1);
    }
    getRootPath() {
        const rootPath = (0, path_1.resolve)(process.argv.slice(2)[0]).split('/').slice(0, -1).join('/');
        return rootPath;
    }
    createBaseHeaders() {
        this.baseHeaders = {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }
    async isExtension() {
        this.createBaseHeaders();
        const headers = {
            ...this.baseHeaders
        };
        const url = `https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${this.projectId}&filter=${this.extensionName}`;
        try {
            const isExtension = await axios_1.default.get(url, { headers, httpsAgent: this.axiosAgent });
            this.setExtensionMeta(isExtension.data);
            return !!isExtension.data.total;
        }
        catch (err) {
            throw new Error(err);
        }
    }
    setExtensionMeta(meta) {
        this.extensionMeta = JSON.parse(JSON.stringify(meta));
    }
    async uploadNewExtension() {
        console.log("Upload new extension");
        const extensionFile = this.buildArtifact();
        const response = await axios_1.default.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/upload`, extensionFile, {
            headers: {
                ...this.baseHeaders,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: this.axiosAgent
        });
        if (response.status === 202) {
            this.task = response.data;
            await this.waitForTaskCompletion();
            await this.setTrustedExtension();
        }
        else {
            throw new Error("Task has not been created!");
        }
    }
    async updateExtension() {
        console.log("Update existing extension");
        const extensionFile = this.buildArtifact();
        const response = await axios_1.default.post(`https://api-eon.cognigy.cloud/new/v2.0/extensions/update`, extensionFile, {
            headers: {
                ...this.baseHeaders,
                'Content-Type': 'multipart/form-data'
            },
            httpsAgent: this.axiosAgent
        }).catch(err => { throw new Error(err); });
        if (response.status === 202) {
            this.task = response.data;
            await this.waitForTaskCompletion();
            await this.setTrustedExtension();
        }
        else {
            throw new Error("Task has not been created!");
        }
    }
    buildArtifact() {
        const fileToUpload = this.readLocalExtension(this.extensionPath);
        const artifact = new FormData();
        artifact.append("projectId", this.projectId);
        if (this.isUpload()) {
            artifact.append("extension", this.extensionMeta.items[0]._id);
        }
        artifact.append("file", fileToUpload, {
            filename: (0, path_1.basename)(this.extensionPath) + "_CU"
        });
        return artifact;
    }
    isUpload() {
        return !!this.extensionMeta.items.length;
    }
    readLocalExtension(path) {
        return (0, fs_1.readFileSync)(path);
    }
    async waitForTaskCompletion() {
        const startTime = Date.now();
        while (this.task.status !== 'done') {
            if (this.task.status === 'error') {
                console.log('task with id', this.task._id, 'failed. Metadata:', this.task);
                console.log('extension upload failed!');
                process.exit(1);
            }
            // sleep 1s
            await new Promise(a => setTimeout(() => a(), 1000));
            try {
                const { data } = await axios_1.default.get(`https://api-eon.cognigy.cloud/new/v2.0/tasks/${this.task._id}`, {
                    headers: this.baseHeaders,
                    httpsAgent: this.axiosAgent
                });
                this.task = data;
                const elapsedTime = Math.round((Date.now() - startTime) / 1000);
                process.stdout.write(`\rElapsed time ${elapsedTime}s | ${this.task.currentStep}%`);
            }
            catch (err) {
                throw new Error(`\n${err}`);
            }
        }
        console.log("\nTask completed");
    }
    async getExtensionMetadata(projectId, extensionName) {
        try {
            const response = await axios_1.default.get(`https://api-eon.cognigy.cloud/new/v2.0/extensions?projectId=${projectId}&filter=${extensionName}`, {
                headers: this.baseHeaders,
                httpsAgent: this.axiosAgent
            });
            return response.data.items[0];
        }
        catch (err) {
            throw new Error(err);
        }
    }
    async setTrustedExtension() {
        const projectId = this.projectId;
        const extensionMeta = await this.getExtensionMetadata(projectId, this.extensionName);
        console.log(`Trusting extension with ID ${extensionMeta._id}`);
        try {
            const updateReponse = await axios_1.default.patch(`https://api-eon.cognigy.cloud/new/v2.0/extensions/${extensionMeta._id}`, { trustedCode: true }, {
                headers: {
                    ...this.baseHeaders
                },
                httpsAgent: this.axiosAgent
            });
            if (updateReponse.status === 204) {
                console.log('Task completed');
            }
            else {
                throw new Error(updateReponse);
            }
        }
        catch (err) {
            throw new Error(err);
        }
    }
}
exports.default = UploadController;
