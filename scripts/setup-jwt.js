#!/usr/bin/env node

/**
 * Automates the post-installation JWT setup described in docs/installation.md:
 * creates the Flow_Scanner self-signed certificate, creates the Flow Scanner JWT
 * External Client App, stores the Consumer Key and verifies the connection.
 *
 * Usage: node scripts/setup-jwt.js --target-org <alias> [--namespace lfscanner]
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_NAME = "Flow_Scanner_JWT";
const CERT_NAME = "Flow_Scanner";
const PERMISSION_SET = "Flow_Scanner";
const API_VERSION = "67.0";
const CALLBACK_URL = "https://login.salesforce.com/services/oauth2/success";

function parseArgs(argv) {
  "use strict";
  const args = { namespace: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--target-org" || arg === "-o") {
      args.targetOrg = argv[++i];
    } else if (arg === "--namespace" || arg === "-n") {
      args.namespace = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  return args;
}

function quote(arg) {
  "use strict";
  // Double quotes work in both cmd.exe and POSIX shells; sf is a shim, not an .exe,
  // so the command has to go through a shell on Windows either way.
  return /^[\w.:/\\@-]+$/.test(arg)
    ? arg
    : `"${String(arg).replace(/"/g, '\\"')}"`;
}

function sf(args) {
  "use strict";
  return execSync(["sf"].concat(args.map(quote)).join(" "), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024
  });
}

function sfJson(args) {
  "use strict";
  let output;
  try {
    output = sf(args.concat(["--json"]));
  } catch (error) {
    // The CLI still writes a JSON payload to stdout on a non-zero exit.
    output = error.stdout;
    if (!output) {
      throw error;
    }
  }
  return JSON.parse(output);
}

function createTempDir(prefix) {
  "use strict";
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupTempDir(tempDir) {
  "use strict";
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    console.log(`Warning: could not clean up ${tempDir}: ${error.message}`);
  }
}

function writeFile(filePath, contents) {
  "use strict";
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf8");
}

function buildPackageXml(types) {
  "use strict";
  const blocks = types
    .map((type) => {
      const members = type.members
        .map((member) => `        <members>${member}</members>`)
        .join("\n");
      return `    <types>\n${members}\n        <name>${type.name}</name>\n    </types>`;
    })
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
    blocks,
    `    <version>${API_VERSION}</version>`,
    "</Package>",
    ""
  ].join("\n");
}

function deploy(targetOrg, metadataDir, label) {
  "use strict";
  const result = sfJson([
    "project",
    "deploy",
    "start",
    "--metadata-dir",
    metadataDir,
    "--target-org",
    targetOrg,
    "--wait",
    "15"
  ]);
  const details = (result.result && result.result.details) || {};
  let failures = details.componentFailures || [];
  if (!Array.isArray(failures)) {
    failures = [failures];
  }
  if (
    failures.length > 0 ||
    !result.result ||
    result.result.status !== "Succeeded"
  ) {
    for (const failure of failures) {
      console.error(
        `  ${failure.componentType} ${failure.fullName}: ${failure.problem}`
      );
    }
    throw new Error(`Deploy failed: ${label}`);
  }
}

function retrieve(targetOrg, manifestPath) {
  "use strict";
  const outputDir = createTempDir("flow-scanner-retrieve-");
  sfJson([
    "project",
    "retrieve",
    "start",
    "--manifest",
    manifestPath,
    "--target-org",
    targetOrg,
    "--target-metadata-dir",
    outputDir,
    "--unzip",
    "--wait",
    "15"
  ]);
  return path.join(outputDir, "unpackaged", "unpackaged");
}

function query(targetOrg, soql, useToolingApi) {
  "use strict";
  const args = ["data", "query", "--query", soql, "--target-org", targetOrg];
  if (useToolingApi) {
    args.push("--use-tooling-api");
  }
  const result = sfJson(args);
  return (result.result && result.result.records) || [];
}

function expirationDate() {
  "use strict";
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  // The Metadata API rejects a bare date here; it must be a full xsd:dateTime.
  return `${date.toISOString().split("T")[0]}T00:00:00.000Z`;
}

function ensureCertificate(targetOrg) {
  "use strict";
  const existing = query(
    targetOrg,
    `SELECT Id FROM Certificate WHERE DeveloperName = '${CERT_NAME}'`,
    true
  );
  if (existing.length > 0) {
    console.log(`Certificate ${CERT_NAME} already exists, keeping it.`);
    return;
  }

  const tempDir = createTempDir("flow-scanner-cert-");
  try {
    writeFile(
      path.join(tempDir, "package.xml"),
      buildPackageXml([{ name: "Certificate", members: [CERT_NAME] }])
    );
    // An empty .crt tells Salesforce to generate the key pair itself.
    writeFile(path.join(tempDir, "certs", `${CERT_NAME}.crt`), "");
    writeFile(
      path.join(tempDir, "certs", `${CERT_NAME}.crt-meta.xml`),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Certificate xmlns="http://soap.sforce.com/2006/04/metadata">',
        "    <caSigned>false</caSigned>",
        "    <encryptedWithPlatformEncryption>false</encryptedWithPlatformEncryption>",
        `    <expirationDate>${expirationDate()}</expirationDate>`,
        "    <keySize>2048</keySize>",
        "    <masterLabel>Flow Scanner</masterLabel>",
        "    <privateKeyExportable>false</privateKeyExportable>",
        "</Certificate>",
        ""
      ].join("\n")
    );
    deploy(targetOrg, tempDir, "certificate");
    console.log(`Created self-signed certificate ${CERT_NAME}.`);
  } finally {
    cleanupTempDir(tempDir);
  }
}

function readCertificate(targetOrg) {
  "use strict";
  const tempDir = createTempDir("flow-scanner-cert-manifest-");
  try {
    const manifestPath = path.join(tempDir, "package.xml");
    writeFile(
      manifestPath,
      buildPackageXml([{ name: "Certificate", members: [CERT_NAME] }])
    );
    const retrieved = retrieve(targetOrg, manifestPath);
    const pem = fs.readFileSync(
      path.join(retrieved, "certs", `${CERT_NAME}.crt`)
    );
    cleanupTempDir(path.resolve(retrieved, "..", ".."));
    return pem.toString("base64");
  } finally {
    cleanupTempDir(tempDir);
  }
}

function adminProfileName(targetOrg) {
  "use strict";
  const username = sfJson(["org", "display", "--target-org", targetOrg]).result
    .username;
  const records = query(
    targetOrg,
    `SELECT Profile.Name FROM User WHERE Username = '${username}'`,
    false
  );
  // Not every org is in English: a scratch org can report "Systeembeheerder".
  return records.length > 0 && records[0].Profile
    ? records[0].Profile.Name
    : "System Administrator";
}

function appManifest() {
  "use strict";
  return buildPackageXml([
    { name: "ExternalClientApplication", members: [APP_NAME] },
    { name: "ExtlClntAppOauthSettings", members: [APP_NAME] },
    { name: "ExtlClntAppGlobalOauthSettings", members: [APP_NAME] },
    { name: "ExtlClntAppOauthConfigurablePolicies", members: [APP_NAME] }
  ]);
}

function ensureExternalClientApp(
  targetOrg,
  certificateBase64,
  contactEmail,
  profileName
) {
  "use strict";
  const tempDir = createTempDir("flow-scanner-eca-");
  try {
    writeFile(path.join(tempDir, "package.xml"), appManifest());
    writeFile(
      path.join(tempDir, "externalClientApps", `${APP_NAME}.eca-meta.xml`),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ExternalClientApplication xmlns="http://soap.sforce.com/2006/04/metadata">',
        `    <contactEmail>${contactEmail}</contactEmail>`,
        "    <description>JWT Bearer Flow app used by Lightning Flow Scanner for Tooling API calls.</description>",
        "    <distributionState>Local</distributionState>",
        "    <isProtected>false</isProtected>",
        "    <label>Flow Scanner JWT</label>",
        "    <managedType>Local</managedType>",
        "</ExternalClientApplication>",
        ""
      ].join("\n")
    );
    writeFile(
      path.join(
        tempDir,
        "extlClntAppOauthSettings",
        `${APP_NAME}.ecaOauth-meta.xml`
      ),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ExtlClntAppOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">',
        // RefreshToken is required: without it the JWT flow rejects pre-authorized requests.
        "    <commaSeparatedOauthScopes>Api,RefreshToken</commaSeparatedOauthScopes>",
        `    <externalClientApplication>${APP_NAME}</externalClientApplication>`,
        "    <label>Flow Scanner JWT OAuth</label>",
        "</ExtlClntAppOauthSettings>",
        ""
      ].join("\n")
    );
    writeFile(
      path.join(
        tempDir,
        "extlClntAppGlobalOauthSets",
        `${APP_NAME}.ecaGlblOauth-meta.xml`
      ),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ExtlClntAppGlobalOauthSettings xmlns="http://soap.sforce.com/2006/04/metadata">',
        `    <callbackUrl>${CALLBACK_URL}</callbackUrl>`,
        `    <certificate>${certificateBase64}</certificate>`,
        `    <externalClientApplication>${APP_NAME}</externalClientApplication>`,
        "    <isClientCredentialsFlowEnabled>false</isClientCredentialsFlowEnabled>",
        "    <isCodeCredFlowEnabled>false</isCodeCredFlowEnabled>",
        "    <isConsumerSecretOptional>true</isConsumerSecretOptional>",
        "    <isDeviceFlowEnabled>false</isDeviceFlowEnabled>",
        "    <isNamedUserJwtEnabled>true</isNamedUserJwtEnabled>",
        "    <isTokenExchangeEnabled>false</isTokenExchangeEnabled>",
        "    <label>Flow Scanner JWT Global OAuth</label>",
        "</ExtlClntAppGlobalOauthSettings>",
        ""
      ].join("\n")
    );
    writeFile(
      path.join(
        tempDir,
        "extlClntAppOauthPolicies",
        `${APP_NAME}.ecaOauthPlcy-meta.xml`
      ),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ExtlClntAppOauthConfigurablePolicies xmlns="http://soap.sforce.com/2006/04/metadata">',
        `    <commaSeparatedProfile>${profileName}</commaSeparatedProfile>`,
        `    <externalClientApplication>${APP_NAME}</externalClientApplication>`,
        "    <ipRelaxationPolicyType>Bypass</ipRelaxationPolicyType>",
        "    <isClientCredentialsFlowEnabled>false</isClientCredentialsFlowEnabled>",
        "    <isTokenExchangeFlowEnabled>false</isTokenExchangeFlowEnabled>",
        "    <label>Flow Scanner JWT Policies</label>",
        "    <permittedUsersPolicyType>AdminApprovedPreAuthorized</permittedUsersPolicyType>",
        "    <refreshTokenPolicyType>Infinite</refreshTokenPolicyType>",
        "</ExtlClntAppOauthConfigurablePolicies>",
        ""
      ].join("\n")
    );
    deploy(targetOrg, tempDir, "external client app");
    console.log(`Deployed External Client App ${APP_NAME}.`);
  } finally {
    cleanupTempDir(tempDir);
  }
}

function readConsumerKey(targetOrg) {
  "use strict";
  const tempDir = createTempDir("flow-scanner-eca-manifest-");
  try {
    const manifestPath = path.join(tempDir, "package.xml");
    writeFile(manifestPath, appManifest());
    const retrieved = retrieve(targetOrg, manifestPath);
    const settingsDir = path.join(retrieved, "extlClntAppGlobalOauthSets");
    const file = fs
      .readdirSync(settingsDir)
      .find((name) => name.startsWith(APP_NAME));
    const xml = fs.readFileSync(path.join(settingsDir, file), "utf8");
    cleanupTempDir(path.resolve(retrieved, "..", ".."));
    const match = xml.match(/<consumerKey>([^<]+)<\/consumerKey>/);
    if (!match) {
      throw new Error("The retrieved External Client App has no Consumer Key.");
    }
    return match[1];
  } finally {
    cleanupTempDir(tempDir);
  }
}

function runApex(targetOrg, apex) {
  "use strict";
  const tempDir = createTempDir("flow-scanner-apex-");
  try {
    const apexFile = path.join(tempDir, "run.apex");
    writeFile(apexFile, apex);
    const result = sfJson([
      "apex",
      "run",
      "--file",
      apexFile,
      "--target-org",
      targetOrg
    ]);
    const body = result.result || {};
    if (!body.success || !body.compiled) {
      throw new Error(
        body.compileProblem || body.exceptionMessage || "Anonymous Apex failed."
      );
    }
    return body.logs || "";
  } finally {
    cleanupTempDir(tempDir);
  }
}

function assignPermissionSet(targetOrg) {
  "use strict";
  const result = sfJson([
    "org",
    "assign",
    "permset",
    "--name",
    PERMISSION_SET,
    "--target-org",
    targetOrg
  ]);
  const failures = (result.result && result.result.failures) || [];
  const duplicate = failures.every((failure) =>
    /Duplicate PermissionSetAssignment/i.test(failure.message || "")
  );
  if (failures.length > 0 && !duplicate) {
    throw new Error(failures.map((failure) => failure.message).join("; "));
  }
  console.log(`Permission set ${PERMISSION_SET} assigned.`);
}

function sleep(milliseconds) {
  "use strict";
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function configureAndVerify(targetOrg, consumerKey, namespace) {
  "use strict";
  const prefix = namespace ? `${namespace}.` : "";
  runApex(targetOrg, `${prefix}LFSSetup.configure('${consumerKey}');`);

  // configure() deploys protected custom metadata asynchronously, so wait for it.
  const statusApex = [
    `${prefix}LFSSetupController.SetupStatus status = ${prefix}LFSSetupController.getSetupStatus();`,
    "System.debug('FLOW_SCANNER_STATUS=' + JSON.serialize(status));"
  ].join("\n");
  let configured = false;
  for (let attempt = 0; attempt < 15 && !configured; attempt++) {
    sleep(4000);
    const status = readDebugJson(
      runApex(targetOrg, statusApex),
      "FLOW_SCANNER_STATUS"
    );
    configured = status.consumerKeyConfigured === true;
  }
  if (!configured) {
    throw new Error("The Consumer Key was not stored within a minute.");
  }

  const testApex = [
    `${prefix}LFSSetupController.ConnectionResult result = ${prefix}LFSSetupController.testConnection();`,
    "System.debug('FLOW_SCANNER_RESULT=' + JSON.serialize(result));"
  ].join("\n");
  return readDebugJson(runApex(targetOrg, testApex), "FLOW_SCANNER_RESULT");
}

function readDebugJson(logs, marker) {
  "use strict";
  const match = logs.match(new RegExp(`${marker}=(\\{.*?\\})\\s*$`, "m"));
  if (!match) {
    throw new Error(`Could not read ${marker} from the debug log.`);
  }
  return JSON.parse(match[1]);
}

function main() {
  "use strict";
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.targetOrg) {
    console.log(
      "Usage: node scripts/setup-jwt.js --target-org <alias> [--namespace lfscanner]"
    );
    process.exit(args.help ? 0 : 1);
  }

  const targetOrg = args.targetOrg;
  const contactEmail = sfJson(["org", "display", "--target-org", targetOrg])
    .result.username;

  ensureCertificate(targetOrg);
  const certificateBase64 = readCertificate(targetOrg);
  ensureExternalClientApp(
    targetOrg,
    certificateBase64,
    contactEmail,
    adminProfileName(targetOrg)
  );

  const consumerKey = readConsumerKey(targetOrg);
  console.log(`Consumer Key retrieved (${consumerKey.slice(0, 8)}...).`);

  assignPermissionSet(targetOrg);
  const connection = configureAndVerify(targetOrg, consumerKey, args.namespace);
  if (!connection.success) {
    throw new Error(`Connection test failed: ${connection.message}`);
  }
  console.log(`Done. ${connection.message}`);
}

try {
  main();
} catch (error) {
  console.error(`Setup failed: ${error.message}`);
  process.exit(1);
}
