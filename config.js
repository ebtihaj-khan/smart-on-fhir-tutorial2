/**
 * Environment-based Configuration
 * Automatically detects localhost vs deployed environment and uses appropriate credentials
 */

(function(window) {
  'use strict';

  // Detect environment based on hostname
  function getEnvironment() {
    var hostname = window.location.hostname;
    var protocol = window.location.protocol;
    
    // Check if we're on localhost or 127.0.0.1
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
      return 'local';
    }
    
    // Check if we're on the deployed Vercel domain
    if (hostname.includes('vercel.app') || hostname.includes('smart-on-fhir-tutorial2')) {
      return 'deployed';
    }
    
    // Default to local for development
    return 'local';
  }

  // Environment configurations
  var environments = {
    local: {
      clientId: '3e0b9045-0ea9-432a-848f-cccfed325142',
      applicationId: 'ccfeb89f-1051-42c9-b53e-f9a411b69863',
      redirectUri: 'http://localhost:443/index.html',
      redirectUriBase: 'http://localhost:443/',
      launchUri: 'http://localhost:443/launch.html',
      baseUrl: 'http://localhost:443'
    },
    deployed: {
      clientId: 'f60d64fd-1ca1-4986-a661-bc28f2fc3ff7',
      applicationId: 'a38f9781-2ae9-4e0f-bd25-085722b78b7d',
      redirectUri: 'https://smart-on-fhir-tutorial2.vercel.app/',
      redirectUriBase: 'https://smart-on-fhir-tutorial2.vercel.app/',
      launchUri: 'https://smart-on-fhir-tutorial2.vercel.app/launch.html',
      baseUrl: 'https://smart-on-fhir-tutorial2.vercel.app'
    }
  };

  // Get current environment
  var currentEnv = getEnvironment();
  var config = environments[currentEnv];

  // Add environment info to config
  config.environment = currentEnv;
  config.isLocal = currentEnv === 'local';
  config.isDeployed = currentEnv === 'deployed';

  // OAuth scopes (same for both environments)
  config.scopes = 'launch online_access openid profile fhirUser patient/Patient.read patient/Observation.read patient/MedicationRequest.read patient/MedicationRequest.write patient/MedicationDispense.read patient/MedicationDispense.write patient/AllergyIntolerance.read patient/Condition.read patient/DocumentReference.read patient/Encounter.read patient/Encounter.write user/Encounter.write user/MedicationRequest.write user/MedicationDispense.write';

  // Log configuration for debugging
  console.log('=== CONFIGURATION ===');
  console.log('Environment:', currentEnv);
  console.log('Hostname:', window.location.hostname);
  console.log('Client ID:', config.clientId);
  console.log('Application ID:', config.applicationId);
  console.log('Redirect URI:', config.redirectUri);
  console.log('Launch URI:', config.launchUri);

  // Export configuration
  window.appConfig = config;

})(window);
