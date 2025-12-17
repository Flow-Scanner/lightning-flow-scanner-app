## Post-Installation Setup (takes ~3–5 minutes)

To enable server-to-server authentication for your application using JWT Bearer Flow, follow these steps to manually create and configure a Connected App with a self-signed certificate.

### Step 1 – Assign the Permission Set
1. Go to **Setup → Permission Sets → Flow Scanner User**.
2. Click **Manage Assignments** → add your users → **Done**.

### Step 2 – Create the Connected App
1. Go to **Setup → App Manager → New Connected App**.
2. Fill in the basic info:
   - **Connected App Name**: `Flow Scanner JWT`
   - **API Name**: `Flow_Scanner_JWT` (auto-populates based on the name)
   - **Contact Email**: your email address
3. Under **API (Enable OAuth Settings)**:
   - Check **Enable OAuth Settings**
   - **Callback URL**: `https://login.salesforce.com/services/oauth2/success` (placeholder; not used in JWT flow but required)
   - Check **Use digital signatures**
   - **Require Secret for Web Server Flow**: Uncheck (if visible)but we
   - **Require Secret for Refresh Token Flow**: Uncheck
   - **Enable Client Credential Flow**: Uncheck
   - **Enable Authorization Code Flow**: Uncheck
   - **Require PKCE**: Uncheck
   - **Enable Token Exchange Flow**: Uncheck
   - **Selected OAuth Scopes**: Add `Access and manage your data (api)` and `Perform requests on your behalf at any time (refresh_token, offline_access)`
   - Uncheck other options like **Enable Named User JWT Flow**, **Introspect All Tokens**, **Refresh Token Rotation**, **Secret Required for Token Exchange**
4. Under **OAuth Policies**:
   - **IP Relaxation**: `Relax IP restrictions`
   - **Refresh Token Policy**: `Refresh token is valid until revoked`
5. Click **Save** (it may take a few minutes for the app to be created).

### Step 3 – Create & Upload the Certificate (45 seconds)
1. Go to **Setup → Certificate and Key Management**.
2. Click **Create Self-Signed Certificate**.
3. Fill in:
   - **Label**: `Flow Scanner`
   - **Unique Name**: `Flow_Scanner` ← **must be exactly this**
   - Key Size: 2048 or higher
4. Click **Save**.
5. Download the certificate (`.crt` file).
6. Go to **App Manager → Flow Scanner JWT → Manage → Edit**.
7. Under **Use digital signatures**, click **Upload Certificate**.
8. Upload the `.crt` file → **Save**.

### Step 4 – Configure the Consumer Key (1 minute)
1. In **App Manager → Flow Scanner JWT → View**.
2. Click **Manage Consumer Details** (verify identity once).
3. **Copy the Consumer Key** (starts with `3MVG…`).
4. Open **Developer Console** (from Setup or the gear icon menu).
5. Go to **Debug → Open Execute Anonymous Window**.
6. **Copy and paste** this script:
```apex
   // PASTE YOUR CONSUMER KEY HERE (between the quotes):
   String consumerKey = '3MVG9P7Pp4QrREPlkZIJuyPabYJemVnctQsM2TEN1Xk.d29tlvzNPXcvb44ESWQ3_GIizTcGkRiivtuZZrFFI';
   
   // Don't edit below this line
   if (String.isBlank(consumerKey) || consumerKey.contains('YOUR_CONSUMER_KEY_HERE')) {
       System.debug('ERROR: Please set your Consumer Key first!');
   } else {
       Metadata.CustomMetadata cmd = new Metadata.CustomMetadata();
       cmd.fullName = 'Flow_Scanner_OAuth_Config_Secure__mdt.Default';
       cmd.label = 'Default';
       
       Metadata.CustomMetadataValue field = new Metadata.CustomMetadataValue();
       field.field = 'Consumer_Key__c';
       field.value = consumerKey;
       cmd.values.add(field);
       
       Metadata.DeployContainer mdc = new Metadata.DeployContainer();
       mdc.addMetadata(cmd);
       
       Id jobId = Metadata.Operations.enqueueDeployment(mdc, null);
       System.debug('✓ SUCCESS! Consumer Key configured. Job ID: ' + jobId);
       System.debug('Wait 10-30 seconds for deployment to complete.');
   }
```

7. **Replace `YOUR_CONSUMER_KEY_HERE`** with your actual Consumer Key (the one you copied in step 3).
8. Click **Execute**.
9. Check the **Logs** tab at the bottom for the "SUCCESS!" message.
10. Wait 10-30 seconds for the deployment to complete.

> **Note:** The Consumer Key is stored securely in protected custom metadata and is not visible in the UI.

### Step 5 – Pre-Authorize the Connected App (optional, to avoid consent screen)
1. In **App Manager → Flow Scanner JWT → Manage → Edit Policies**.
2. Set **Permitted Users** to **Admin approved users are pre-authorized** → **Save**.
3. Scroll to **Profiles** section → **Manage Profiles**.
4. Check **System Administrator** (or relevant profiles) → **Save**.
   - This allows users with those profiles to use the app without prompts. If you need more granularity, create a custom (unmanaged) Permission Set and assign it here instead.

**The app is now ready to use!** Assigned users can run Flow Scanner features, and JWT authentication will handle Tooling API calls seamlessly.