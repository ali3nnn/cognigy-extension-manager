#!/usr/bin/env node

import UploadController from './controller/UploadController'

export const handler = async () => {
    const controller = new UploadController();
    controller.loadConfigFile();
    const isExtension = await controller.isExtension();
    if (isExtension) {
        controller.updateExtension();
    } else {
        controller.uploadNewExtension();
    }
}

handler()