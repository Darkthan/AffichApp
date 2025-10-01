// Helper functions for WebAuthn/Passkeys using @simplewebauthn/browser
// Ce fichier doit être chargé via un bundler ou copié depuis node_modules

// Import des fonctions de @simplewebauthn/browser
// En production, utilisez un bundler comme webpack/rollup
// Pour ce projet, nous allons copier manuellement les fonctions nécessaires

/**
 * Convertit un buffer en base64url
 */
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Convertit base64url en buffer
 */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Prépare les options pour l'enregistrement
 */
function prepareRegistrationOptions(options) {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id)
    },
    excludeCredentials: options.excludeCredentials?.map(cred => ({
      ...cred,
      id: base64urlToBuffer(cred.id)
    }))
  };
}

/**
 * Prépare les options pour l'authentification
 */
function prepareAuthenticationOptions(options) {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: options.allowCredentials?.map(cred => ({
      ...cred,
      id: base64urlToBuffer(cred.id)
    }))
  };
}

/**
 * Formate la réponse d'enregistrement pour l'envoi au serveur
 */
function formatRegistrationResponse(credential) {
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      transports: credential.response.getTransports ? credential.response.getTransports() : []
    },
    type: credential.type
  };
}

/**
 * Formate la réponse d'authentification pour l'envoi au serveur
 */
function formatAuthenticationResponse(credential) {
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    response: {
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
      authenticatorData: bufferToBase64url(credential.response.authenticatorData),
      signature: bufferToBase64url(credential.response.signature),
      userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null
    },
    type: credential.type
  };
}

/**
 * Enregistre une nouvelle passkey
 */
async function startRegistration(options) {
  const preparedOptions = prepareRegistrationOptions(options);
  const credential = await navigator.credentials.create({
    publicKey: preparedOptions
  });

  if (!credential) {
    throw new Error('Création de passkey annulée');
  }

  return formatRegistrationResponse(credential);
}

/**
 * Authentifie avec une passkey
 */
async function startAuthentication(options) {
  const preparedOptions = prepareAuthenticationOptions(options);
  const credential = await navigator.credentials.get({
    publicKey: preparedOptions
  });

  if (!credential) {
    throw new Error('Authentification annulée');
  }

  return formatAuthenticationResponse(credential);
}

// Exporter les fonctions
if (typeof window !== 'undefined') {
  window.WebAuthnHelper = {
    startRegistration,
    startAuthentication
  };
}
