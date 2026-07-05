## Post-Installation Setup (takes ~3–5 minutes)

To enable server-to-server authentication for your application using JWT Bearer Flow, follow these steps to manually create and configure an External Client App with a self-signed certificate.

> **Already set up with a Connected App?** Nothing breaks — see [Existing Connected App setups](#existing-connected-app-setups) below.

### Step 1 – Assign the Permission Set
1. Go to **Setup → Permission Sets → Flow Scanner**.
2. Click **Manage Assignments** → add your users → **Done**.

### Step 2 – Create & Download the Certificate (45 seconds)
1. Go to **Setup → Certificate and Key Management**.
2. Click **Create Self-Signed Certificate**.
3. Fill in:
   - **Label**: `Flow Scanner`
   - **Unique Name**: `Flow_Scanner` ← **must be exactly this**
   - Key Size: 2048 or higher
4. Click **Save**.
5. Click **Download Certificate** and save the `.crt` file — you'll upload it in the next step.

### Step 3 – Create the External Client App
1. Go to **Setup → External Client App Manager**.
   - If you don't see it or can't create apps, first go to **Setup → External Client App Settings** and enable **Allow Creation of External Client Apps**.
2. Click **New External Client App**.
3. Fill in the basic info:
   - **External Client App Name**: `Flow Scanner JWT`
   - **API Name**: `Flow_Scanner_JWT` (auto-populates based on the name)
   - **Contact Email**: your email address
   - **Distribution State**: `Local`
4. Expand **App Settings** and check **Enable OAuth**, then under **OAuth Settings**:
   - **Callback URL**: `https://login.salesforce.com/services/oauth2/success` (placeholder; not used in JWT flow but required)
   - **Selected OAuth Scopes**: add `Manage user data via APIs (api)` **and** `Perform requests at any time (refresh_token, offline_access)`
     - The second scope is required — the JWT Bearer Flow rejects pre-authorized requests without it (`invalid_request: refresh_token scope is required`).
   - Under **Flow Enablement**, check **Enable JWT Bearer Flow**.
   - Where prompted for the JWT Bearer Flow digital signature, click **Upload Files** and upload the `.crt` file from Step 2.
   - Leave all other flows (Client Credentials, Token Exchange, Device Flow, etc.) unchecked.
5. Click **Save**.

### Step 4 – Configure the Consumer Key (1 minute)
1. Open the app in **External Client App Manager → Flow Scanner JWT**.
2. On the **Settings** tab, expand **OAuth Settings** and click **Consumer Key and Secret** (verify identity once).
3. **Copy the Consumer Key** (starts with `3MVG…`).
4. Open the **Flow Scanner** app (App Launcher → search for `Flow Scanner`) and go to its **Setup** tab.
5. Paste the Consumer Key into the **Consumer Key** field and click **Save Consumer Key**.
6. Wait for the confirmation (the deployment takes 10–30 seconds; the step turns green automatically).
7. Click **Test Connection** to verify the end-to-end JWT authentication.

The Setup tab also shows a checklist of the other steps (permission set, certificate) with links into Setup, so you can see at a glance what's still missing.

> **Note:** The Consumer Key is stored securely in protected custom metadata and is not visible in the UI.

<details>
<summary>Alternative: configure via Developer Console (package versions below 3.3, or if you prefer anonymous Apex)</summary>

1. Open **Developer Console** (from Setup or the gear icon menu).
2. Go to **Debug → Open Execute Anonymous Window**.
3. **Copy and paste** this script:
```apex
// PASTE YOUR CONSUMER KEY HERE (between the quotes):
String consumerKey = 'YOUR_CONSUMER_KEY_HERE';

if (String.isBlank(consumerKey) || consumerKey.contains('YOUR_CONSUMER_KEY_HERE')) {
    System.debug('ERROR: Please set your Consumer Key first!');
} else {
    Id jobId =  lfscanner.LFSSetup.configure(consumerKey);
}
```

4. **Replace `YOUR_CONSUMER_KEY_HERE`** with your actual Consumer Key.
5. Click **Execute** and wait 10-30 seconds for the deployment to complete.

> If you deployed the **unmanaged** version, there is no namespace — use `LFSSetup.configure(consumerKey);` instead of `lfscanner.LFSSetup.configure(consumerKey);`.

</details>

### Step 5 – Pre-Authorize the External Client App (optional, to avoid consent screen)
1. In **External Client App Manager → Flow Scanner JWT**, open the **Policies** tab and click **Edit**.
2. Under **OAuth Policies**, set **Permitted Users** to **Admin approved users are pre-authorized** → **Save**.
3. Still on the **Policies** tab, assign the profiles or permission sets that should use Flow Scanner (e.g. **System Administrator**).
   - This allows those users to use the app without prompts. If you need more granularity, create a custom (unmanaged) Permission Set and assign it here instead.

**The app is now ready to use!** Assigned users can run Flow Scanner features, and JWT authentication will handle Tooling API calls seamlessly.

---

## Existing Connected App setups

If you configured Flow Scanner with a Connected App in the past, **you don't need to change anything**. Flow Scanner only stores a Consumer Key and signs its JWT with the `Flow_Scanner` certificate — Salesforce accepts that JWT the same way for Connected Apps and External Client Apps. Upgrading the package does not touch your Connected App, your certificate, or the stored Consumer Key.

Salesforce is restricting the *creation of new* Connected Apps, not the use of existing ones, so staying on your Connected App is fine until Salesforce announces otherwise. These instructions use External Client Apps because that's the supported path for new setups.

If you do want to migrate to an External Client App:

1. Create the External Client App as described in [Step 3](#step-3--create-the-external-client-app). You can upload the **same** `Flow_Scanner` certificate you already use — both apps can hold it during the transition.
2. Pre-authorize the new app first ([Step 5](#step-5--pre-authorize-the-external-client-app-optional-to-avoid-consent-screen)) so there's no consent gap when you switch.
3. Save the new app's Consumer Key in the Flow Scanner **Setup** tab ([Step 4](#step-4--configure-the-consumer-key-1-minute)). Only one key is stored, so this is the moment the switch happens.
4. Click **Test Connection**. If anything is off, saving the old Consumer Key again switches you straight back to the Connected App.
5. Once the test passes, delete the old Connected App.
