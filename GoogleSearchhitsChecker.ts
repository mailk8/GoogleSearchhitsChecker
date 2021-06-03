// Start mit: npx ts-node GoogleSearchhitsChecker.ts
const searchterm: string = '...+...';
const sleepTime: number = 6 * 3_600_000; // Stunden  * Millisekunden pro Stunde
const pingTime: number = 1_814_400_000;// 1 814 400 000 Sekunden = 3 Wochen
let searches: number = 0;
let captachas: number = 0;
let path: string = './knownGoogleHits.txt';
let fileContainer: Array<string> = new Array();
let datetime: Date = new Date();
const startup: Date = new Date();

// Konfig Mailclient
const mailAbsender: string = '';
const mailEmpfaenger: string = '';
let mailContainer: string = '';
const nodemailer = require('./node_modules/nodemailer');
const mailClient = nodemailer.createTransport({ host: 'mx. ... .de', port: 465, secure: true, auth:{ user: mailAbsender, pass: '...' } });

// Konfig Chrome und ReCaptcha Plugin
const captachApiKey: string = '...';
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const chromeOptions = {headless:true, defaultViewport: null /*slowMo:0*/ };
const puppeteer = require('./node_modules/puppeteer-extra')
puppeteer.use( RecaptchaPlugin({ provider: { id: '2captcha', token: captachApiKey }, visualFeedback: false }) )




// initialer Start
mailMe('Google Watch Service gestartet','gestartet am '+startup, 'text');
search();

function sleep(): void {

    try {
        giveAlivePing();
        console.log('sleeping at ' + new Date() + ' getTime ist: ' + new Date().getTime());
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepTime);
        mailContainer = '';
        fileContainer = [];
        search();

    }
    catch (e) {
        console.log(e);
        mailMe('Fehler in Sleep Funktion - Google Searchhit Checker', e.toString(), 'text');
    }
}

function giveAlivePing(): void {
    let actual = new Date();
    if((actual.getTime() - datetime.getTime()) >= pingTime)
    {
        console.log('+# giveAlivePing at ' + new Date() + ' getTime ist: ' + new Date().getTime());
        mailMe('Google Watch ist aktiv :)','Service wurde gestartet am: '+startup.toLocaleDateString('de-DE')+' um: '+startup.toLocaleTimeString('de-DE')+
            '\nDurchgeführte Suchabfragen: '+searches+' Dabei wurden'+captachas+' gefordert.\nService geht nun schlafen für '+ sleepTime/3_600_000+' Stunden.', 'text');
        datetime = new Date();
    }
}

async function search(): Promise<any> {
    try {
        const browser = await puppeteer.launch(chromeOptions);
        const page = await browser.newPage();
        await page.goto('https://www.google.de');

        // Button Eingang
        let selector = 'button[id="L2AGLb"]';
        await page.evaluate((selector: any) => document.querySelector(selector).click(), selector);


        // Suche unter Einbezug aller Ergebnisse
        await page.goto('https://www.google.de/search?q=%22'+searchterm+'%22&filter=0');

        // Prüfen ob Captcha gefordert wird
        console.log('Captach test folgt...');
        let checkIfCaptacha = await page.evaluate(() => {

            Array.of(document.querySelectorAll('*')[Symbol.iterator]).find(element => element.toString().includes('captcha'));

        } );

        if(checkIfCaptacha)
        {
            captachas++;
            console.log('Es wird ein Captacha gefordert!!');
            await page.solveRecaptchas();
        }
        else
        {
            console.log('Es wird kein Captcha gefordert');
        }

        // Alle Suchtreffer als String in ein Array einlesen
        const arraySearchHits = await page.evaluate(() => {
            const htmlElements = Array.from(document.querySelectorAll('.g')); // Komplettes Div
            return htmlElements.map((td: any) => td.innerHTML);
        });

        // Überschriften der Suchtreffer extrahieren, dienen zur Wiedererkennung
        const ueberschriften = await page.evaluate(() => {
            let htmlElements = Array.from(document.querySelectorAll('h3')); // Nur Überschrift
            return htmlElements.map(td => td.innerHTML);
        });

        const knownGoogleHits = readFileIn(path);
        console.log('Aktuelle Treffer: ', arraySearchHits);
        console.log('Überschriften : ', ueberschriften);
        console.log('Known Treffer: ', knownGoogleHits);

        // Bekannte Suchtreffer ausblenden und nur neue Suchtreffer ausgeben
        outer: for (let index in ueberschriften) {
            let text = ueberschriften[index];

            inner: for (let j in knownGoogleHits) {
                let known = knownGoogleHits[j];

                if (known && text.toLowerCase().includes(known.toLowerCase())) {
                    continue outer;
                }
            }
            mailContainer = mailContainer + arraySearchHits[index].toString() + '<br><hr><br>';
            fileContainer.push(text + '\n');

        }

        // Browser schließen
        await page.close();
        await browser.close();
        searches++;

        if(mailContainer) {
            await mailMe('Neue Google Suchtreffer!!', mailContainer, 'html');
        }

        // Bekannte Suchtreffer im Filesystem persistieren
        writeFileOut(path, fileContainer); // Darf nicht im if Block stehen
        // Zweite Schlaffunktion nötig, sonst wird die Mail vorher nicht versandt
        setTimeout(() => { sleep() }, 3000);

    }
    catch (e) {
        console.log(e);
        mailMe('Fehler in Search Funktion - Google Searchhit Checker', e.toString(), 'text');
        setTimeout(() => { sleep() }, 3000);
    }

}



function readFileIn(path: string): Array<string> {
    try {
        console.log('reading file from ', path)
        let fs = require('fs');
        return fs.readFileSync(path).toString().split("\n");
    } catch (e) {
        console.log(e);
        mailMe('Fehler in readFileIn Funktion - Google Searchhit Checker', e.toString(), 'text');
    }
}

function writeFileOut(path: string, array: Array<string>): void {
    console.log('writing file ', array)
    try {
        let fs = require('fs');

        for (let i in array) {
            if (array[i].length) {

                fs.appendFileSync(path, array[i], (err: any) => {
                    if (err) throw err;
                })
            }
        }
    } catch (e) {
        console.log(e);
        mailMe('Fehler in writeFileOut Funktion - Google Searchhit Checker', e.toString(), 'text');
    }

}

async function mailMe(subject: string, message: string, textOrHtml: string): Promise<any> {
    let mailOptions = {
        from: mailAbsender,
        to: mailEmpfaenger,
        subject: subject,
        // text: message,
        // html: message // html body
    };

    if(textOrHtml == 'text')
    {
        mailOptions = { ...mailOptions, ...{text: message}};
        console.log('text Mail');
    }
    if(textOrHtml == 'html')
    {
        mailOptions = { ...mailOptions, ...{html: message}};
        console.log('html Mail');
    }

    console.log('Mail komplett: ' + JSON.stringify(mailOptions));

    mailClient.sendMail(mailOptions, (error: any, info: any) => {
        if (error) {
            console.log('mailMe error: '+ error );
        }
        else {
            console.log('Email sent: ' + info.response);
            return Promise.resolve('OK');
        }
    });
}
