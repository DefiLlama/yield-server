const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const cron = require('node-cron');
const logger = require("../utils/logger");

// Get all handler files
const handlersDir = path.join(__dirname, '..', 'handlers');
const handlers = fs.readdirSync(handlersDir)
    .filter(file => file.startsWith('trigger') && file.endsWith('.js'));

function getTimestamp() {
    return new Date().toISOString();
}

function logMessage(message) {
    logger.info(message);
}

async function runHandlers() {
    const startTime = Date.now();
    logMessage('Starting handlers execution cycle');
    logMessage(`Found ${handlers.length} handlers to execute`);
    
    for (const handlerFile of handlers) {
        const handlerStartTime = Date.now();
        try {
            logMessage(`Starting handler: ${handlerFile}`);
            const handler = require(path.join(handlersDir, handlerFile));
            
            if (typeof handler.handler === 'function') {
                cron.schedule('*/10 * * * *', async (context) => {
                    const task = context.task

                    logMessage(await task.getStatus())

                    await handler.handler()
                }, {
                    noOverlap: true,
                }).on('error', (error) => {
                    logMessage(`Cron error in ${handlerFile}: ${error.message}`, 'ERROR');
                });
            } else {
                logMessage(`Skipping ${handlerFile}: no handler function found`, 'WARN');
            }
        } catch (error) {
            logMessage(`Error in ${handlerFile}: ${error.message}`, 'ERROR');
            logMessage(error.stack, 'ERROR');
        }
    }
}

runHandlers();