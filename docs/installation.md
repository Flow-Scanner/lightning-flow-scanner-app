## Post-Installation Setup (takes ~3–5 minutes)

To enable server-to-server authentication for your application using JWT Bearer Flow, follow these steps to manually create and configure a Connected App with a self-signed certificate.

### Step 1 – Create the Connected App
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

### Step 2 – Create & Upload the Certificate (45 seconds)
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

### Step 3 – Copy & Paste the Consumer Key (30 seconds)
1. In **App Manager → Flow Scanner JWT → View**.
2. Click **Manage Consumer Details** (verify identity once).
3. **Copy the Consumer Key** (starts with `3MVG…`).
4. Go to **Setup → Custom Metadata Types → Flow Scanner OAuth Config → Manage Records**.
5. Edit (or create) the record with **Developer Name = `Default`**.
6. Paste into the **Consumer Key** field → **Save**.

### Step 4 – Pre-Authorize the Connected App (optional, to avoid consent screen)
1. In **App Manager → Flow Scanner JWT → Manage → Edit Policies**.
2. Set **Permitted Users** to **Admin approved users are pre-authorized** → **Save**.
3. Scroll to **Profiles** section → **Manage Profiles**.
4. Check **System Administrator** (or relevant profiles) → **Save**.
   - This allows users with those profiles to use the app without prompts. If you need more granularity, create a custom (unmanaged) Permission Set and assign it here instead.

### Step 5 – Assign the Permission Set
1. Go to **Setup → Permission Sets → Flow Scanner User**.
2. Click **Manage Assignments** → add your users → **Done**.

**The app is now ready to use!** Assigned users can run Flow Scanner features, and JWT authentication will handle Tooling API calls seamlessly.