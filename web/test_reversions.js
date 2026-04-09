import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        console.log("Navigating to local ERP...");
        await page.goto('http://127.0.0.1:5173');

        console.log("Waiting for Settings tab...");
        await page.waitForSelector('text=Ajustes');
        await page.click('text=Ajustes');

        console.log("Waiting for SystemAuditTest block...");
        await page.waitForSelector('text=Prueba de Auditoría');

        console.log("Initiating System Audit Test (Simulation + Ledger Balance + Reversion)...");
        await page.click('button:has-text("Ejecutar Prueba de Auditoría Integral")');

        // Wait for the audit to finish
        await page.waitForFunction(() => {
            const text = document.body.innerText;
            return text.includes('Auditoría completada satisfactoriamente') || text.includes('Auditoría falló');
        }, { timeout: 15000 });

        console.log("Audit Finished. Reading specific test logs...");

        // Let's capture the physical element containing the logs
        const logElement = await page.$('.font-mono.text-\\[10px\\]');
        if (logElement) {
            const logs = await page.evaluate(el => el.innerText, logElement);
            console.log("\n----- INNER AUDIT LOGS -----");
            console.log(logs);
            console.log("----------------------------\n");

            if (logs.includes("✅ Ecuación Contable se mantiene post-anulación") && logs.includes("ECUACIÓN CONTABLE PERFECTA")) {
                console.log("SUCCESS: Reversion Mechanics and Ledger Computations represent a perfect double-entry system.");
                await page.screenshot({ path: '/Users/felipe/.gemini/antigravity/brain/e534b511-f645-4d85-9f8a-a321e58806cf/test_reversion_audit.png' });
            } else {
                console.log("FAILURE: Reversion or Ledger check failed. Review logs above.");
                await page.screenshot({ path: '/Users/felipe/.gemini/antigravity/brain/e534b511-f645-4d85-9f8a-a321e58806cf/test_reversion_audit_fail.png' });
                process.exit(1);
            }
        } else {
            console.log("Could not find log element.");
            process.exit(1);
        }

        await browser.close();
    } catch (e) {
        console.error("Test execution failed:", e);
        process.exit(1);
    }
})();
