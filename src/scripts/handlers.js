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
                const task = cron.schedule('*/10 * * * *', async (context) => {
                    try {
                        await handler.handler()
                    } catch (error) {
                        logger.error(error)
                    }

                    const status = await context.task.getStatus()

                    if (status === "running") {
                        await context.task.destroy()
                    }
                }, {
                    noOverlap: true,
                });

                task.on("execution:failed", (context) => {
                    if (context.execution) {
                        logger.error(context.execution.error)
                    }
                });

                task.on("execution:overlap", (context) => {
                    context.task.destroy()
                });
            } else {
                logMessage(`Skipping ${handlerFile}: no handler function found`);
            }
        } catch (error) {
            logMessage(`Error in ${handlerFile}: ${error.message}`);
            logMessage(error.stack);
        }
    }
}

runHandlers();