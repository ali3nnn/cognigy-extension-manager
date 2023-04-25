#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const UploadController_1 = __importDefault(require("./controller/UploadController"));
const handler = async () => {
    const controller = new UploadController_1.default();
    controller.loadConfig();
    await controller.uploadOrUpdateExtension();
    await controller.taskCompletion();
};
exports.handler = handler;
(0, exports.handler)();
