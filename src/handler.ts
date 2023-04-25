#!/usr/bin/env node

import UploadController from './controller/UploadController'

export const handler = async () => {
    const controller = new UploadController();
    controller.loadConfig();
    await controller.uploadOrUpdateExtension()
    await controller.taskCompletion()
}

handler()