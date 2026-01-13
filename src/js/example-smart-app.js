(function(window){
  // CORS Proxy configuration
  // Proxy is only used for Cerner requests (which have CORS restrictions)
  // SMART Health IT and other sandboxes don't need the proxy
  var USE_PROXY = true;  // Enable proxy for Cerner requests
  var PROXY_URL = 'http://localhost:8081/';  // CORS proxy endpoint
  
  // Helper function to wrap URLs with proxy
  function wrapWithProxy(url) {
    if (!USE_PROXY) return url;
    
    // Only proxy Cerner FHIR requests (they have CORS restrictions)
    // Don't proxy SMART Health IT or other sandboxes
    if (url.includes('fhir-ehr-code.cerner.com') || 
        url.includes('fhir-ehr.cerner.com') ||
        url.includes('cerner.com')) {
      console.log('[PROXY] Wrapping Cerner URL with proxy:', url);
      return PROXY_URL + url;
    }
    
    // For non-Cerner URLs (like SMART Health IT), return as-is
    return url;
  }
  
  // Helper function to convert text to sentence case
  function toSentenceCase(text) {
    if (!text || typeof text !== 'string') return text;
    
    // Convert to lowercase first
    var lower = text.toLowerCase();
    
    // Capitalize first letter
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  // Helper function to format status values
  function formatStatus(status) {
    if (!status) return status;
    
    var statusMap = {
      'active': 'Active',
      'inactive': 'Inactive',
      'confirmed': 'Confirmed',
      'refuted': 'Refuted',
      'entered-in-error': 'Entered in error',
      'current': 'Current',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'draft': 'Draft',
      'final': 'Final',
      'amended': 'Amended',
      'superseded': 'Superseded',
      'entered-in-error': 'Entered in error',
      'unknown': 'Unknown',
      'high': 'High',
      'medium': 'Medium',
      'low': 'Low',
      'critical': 'Critical',
      'moderate': 'Moderate',
      'mild': 'Mild',
      'severe': 'Severe'
    };
    
    return statusMap[status.toLowerCase()] || toSentenceCase(status);
  }

  // Helper function to get encounter ID from FHIR client context
  function getEncounterIdFromContext(smart) {
    console.log('Getting encounter ID from FHIR client context...');
    console.log('smart object:', smart);
    console.log('smart.state:', smart.state);
    console.log('smart.state.tokenResponse:', smart.state && smart.state.tokenResponse);
    console.log('FHIR Server URL:', smart.state.serverUrl);
    console.log('Expected ISS from launch:', window.location.search);
    
    // Try multiple methods to get encounter ID
    var encounterId = null;
    
    // Method 1: Direct method if available
    if (typeof smart.getEncounterId === 'function') {
      encounterId = smart.getEncounterId();
      console.log('Encounter ID from getEncounterId():', encounterId);
    }
    
    // Method 2: From token response
    if (!encounterId && smart.state && smart.state.tokenResponse && smart.state.tokenResponse.encounter) {
      encounterId = smart.state.tokenResponse.encounter;
      console.log('Encounter ID from tokenResponse.encounter:', encounterId);
    }
    
    // Method 3: From launch context
    if (!encounterId && smart.state && smart.state.tokenResponse && smart.state.tokenResponse.launch) {
      // The launch parameter might contain encounter info
      console.log('Launch parameter:', smart.state.tokenResponse.launch);
    }
    
    // Method 4: From patient context if available
    if (!encounterId && smart.patient && typeof smart.patient.getEncounterId === 'function') {
      encounterId = smart.patient.getEncounterId();
      console.log('Encounter ID from patient.getEncounterId():', encounterId);
    }
    
    console.log('Final encounter ID:', encounterId);
    return encounterId;
  }


  // Global variable to store SMART client for write operations
  window.smartClient = null;

  /**
   * Read an existing Encounter by ID
   * @param {string} encounterId - The ID of the encounter to read
   * @returns {Promise} Promise that resolves with the encounter resource
   */
  window.readEncounter = function(encounterId) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var url = smart.state.serverUrl + '/Encounter/' + encounterId;
    var wrappedUrl = wrapWithProxy(url);

    console.log('Reading encounter:', encounterId);
    console.log('URL:', wrappedUrl);

    // Get access token
    var accessToken = null;
    if (smart.state && smart.state.tokenResponse) {
      if (smart.state.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.access_token;
      } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.tokenResponse.access_token;
      }
    }

    return fetch(wrappedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        'Authorization': accessToken ? 'Bearer ' + accessToken : ''
      }
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to read encounter: ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(function(data) {
      console.log('Encounter read successfully:', data);
      return data;
    });
  };

  /**
   * Update an existing Encounter (full update using PUT)
   * @param {string} encounterId - The ID of the encounter to update
   * @param {Object} encounterData - Updated encounter data (same structure as createEncounter)
   * @returns {Promise} Promise that resolves with the updated encounter
   */
  window.updateEncounter = function(encounterId, encounterData) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    // First, read the existing encounter to get the current version
    return window.readEncounter(encounterId).then(function(existingEncounter) {
      console.log('Existing encounter:', existingEncounter);
      
      // Build the updated encounter by merging existing data with new data
      // We'll use the same logic as createEncounter but merge with existing
      var smart = window.smartClient;
      var patientId = existingEncounter.subject?.reference?.replace('Patient/', '') || smart.patient.id;
      
      // Use existing encounter as base, then apply updates
      var updatedEncounter = JSON.parse(JSON.stringify(existingEncounter));
      
      // Update status if provided
      if (encounterData.status) {
        updatedEncounter.status = encounterData.status;
      }
      
      // Update period if provided
      if (encounterData.startDate) {
        if (!updatedEncounter.period) {
          updatedEncounter.period = {};
        }
        updatedEncounter.period.start = encounterData.startDate;
      }
      if (encounterData.endDate !== undefined) {
        if (!updatedEncounter.period) {
          updatedEncounter.period = {};
        }
        if (encounterData.endDate) {
          updatedEncounter.period.end = encounterData.endDate;
        } else {
          delete updatedEncounter.period.end;
        }
      }
      
      // Update type if provided
      if (encounterData.type && encounterData.type.trim() !== '') {
        var encounterType = encounterData.type.trim();
        var typeSystem = encounterData.typeSystem || 'http://terminology.hl7.org/CodeSystem/v2-0004';
        var typeDisplay = encounterData.typeDisplay;
        
        var typeDisplayMap = {
          'O': 'Outpatient',
          'I': 'Inpatient',
          'E': 'Emergency',
          'P': 'Pre-admit',
          'R': 'Recurring patient',
          'B': 'Obstetrics',
          'C': 'Commercial Account',
          'N': 'Not Applicable',
          'U': 'Unknown'
        };
        
        var finalTypeDisplay = typeDisplay || typeDisplayMap[encounterType] || encounterType;
        
        updatedEncounter.type = [{
          coding: [{
            system: typeSystem,
            code: encounterType,
            display: finalTypeDisplay
          }],
          text: finalTypeDisplay
        }];
      }
      
      // Update reasonCode if provided
      if (encounterData.reasonCode !== undefined) {
        if (encounterData.reasonCode && encounterData.reasonCode.trim() !== '') {
          var reasonCode = encounterData.reasonCode.trim();
          var reasonDisplay = encounterData.reasonDisplay || reasonCode;
          
          if (/^\d+$/.test(reasonCode)) {
            updatedEncounter.reasonCode = [{
              coding: [{
                system: 'http://snomed.info/sct',
                code: reasonCode,
                display: reasonDisplay
              }],
              text: reasonDisplay
            }];
          } else {
            var reasonCodeObj = { text: reasonCode };
            if (/^[A-Z]\d{2}/.test(reasonCode)) {
              reasonCodeObj.coding = [{
                system: 'http://hl7.org/fhir/sid/icd-10',
                code: reasonCode,
                display: reasonDisplay
              }];
            }
            updatedEncounter.reasonCode = [reasonCodeObj];
          }
        } else {
          // Remove reasonCode if empty string provided
          delete updatedEncounter.reasonCode;
        }
      }
      
      // Update location if provided
      if (encounterData.location !== undefined) {
        if (encounterData.location && encounterData.location.trim() !== '') {
          var locationRef = encounterData.location.trim();
          if (/^\d+$/.test(locationRef)) {
            locationRef = 'Location/' + locationRef;
          } else if (!locationRef.startsWith('Location/')) {
            locationRef = 'Location/' + locationRef;
          }
          updatedEncounter.location = [{
            location: {
              reference: locationRef
            }
          }];
          // Remove serviceProvider if location is set (they're mutually exclusive)
          delete updatedEncounter.serviceProvider;
        } else {
          delete updatedEncounter.location;
        }
      }
      
      // Update serviceProvider if provided
      if (encounterData.serviceProvider !== undefined) {
        if (encounterData.serviceProvider && encounterData.serviceProvider.trim() !== '') {
          var serviceProviderRef = encounterData.serviceProvider.trim();
          if (/^\d+$/.test(serviceProviderRef)) {
            serviceProviderRef = 'Organization/' + serviceProviderRef;
          } else if (!serviceProviderRef.startsWith('Organization/')) {
            serviceProviderRef = 'Organization/' + serviceProviderRef;
          }
          updatedEncounter.serviceProvider = {
            reference: serviceProviderRef
          };
          // Remove location if serviceProvider is set (they're mutually exclusive)
          delete updatedEncounter.location;
        } else {
          delete updatedEncounter.serviceProvider;
        }
      }
      
      // Now perform the PUT update
      var url = smart.state.serverUrl + '/Encounter/' + encounterId;
      var wrappedUrl = wrapWithProxy(url);
      
      // Get access token
      var accessToken = null;
      if (smart.state && smart.state.tokenResponse) {
        if (smart.state.tokenResponse.access_token) {
          accessToken = smart.state.tokenResponse.access_token;
        } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
          accessToken = smart.state.tokenResponse.tokenResponse.access_token;
        }
      }
      
      console.log('=== UPDATING ENCOUNTER ===');
      console.log('Encounter ID:', encounterId);
      console.log('Updated encounter:', JSON.stringify(updatedEncounter, null, 2));
      
      return fetch(wrappedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/fhir+json',
          'Accept': 'application/fhir+json',
          'Authorization': accessToken ? 'Bearer ' + accessToken : '',
          'If-Match': existingEncounter.meta?.versionId || '*'
        },
        body: JSON.stringify(updatedEncounter)
      })
      .then(function(response) {
        return response.text().then(function(text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { raw: text };
          }
          
          if (!response.ok) {
            var error = new Error('Failed to update encounter: ' + response.status + ' ' + response.statusText);
            error.status = response.status;
            error.statusText = response.statusText;
            error.responseJSON = data;
            throw error;
          }
          
          console.log('Encounter updated successfully:', data);
          return data;
        });
      });
    });
  };

  /**
   * Helper function to find available Location or Organization resources
   * Useful for finding valid IDs to use when creating encounters
   * @param {string} resourceType - 'Location' or 'Organization'
   * @returns {Promise} Promise that resolves with available resources
   */
  window.findAvailableResources = function(resourceType) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var url = smart.state.serverUrl + '/' + resourceType + '?_count=20';
    var wrappedUrl = wrapWithProxy(url);

    console.log('Searching for available ' + resourceType + ' resources...');

    return fetch(wrappedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        'Authorization': 'Bearer ' + (smart.state.tokenResponse?.access_token || '')
      }
    })
    .then(function(response) {
      return response.json().then(function(data) {
        if (data.entry && data.entry.length > 0) {
          var resources = data.entry.map(function(entry) {
            var resource = entry.resource;
            return {
              id: resource.id,
              reference: resourceType + '/' + resource.id,
              name: resource.name || resource.address?.text || resource.id,
              display: (resource.name || resource.address?.text || resource.id) + ' (' + resource.id + ')'
            };
          });
          console.log('Found ' + resources.length + ' ' + resourceType + ' resources:', resources);
          return resources;
        } else {
          console.log('No ' + resourceType + ' resources found');
          return [];
        }
      });
    })
    .catch(function(error) {
      console.error('Error searching for ' + resourceType + ' resources:', error);
      throw error;
    });
  };

  /**
   * Helper function to find available Encounters for the current patient
   * @param {number} count - Maximum number of encounters to return (default: 50)
   * @returns {Promise} Promise that resolves with available encounters
   */
  window.findAvailableEncounters = function(count) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var patientId = smart.patient.id;
    var maxCount = count || 50;
    var url = smart.state.serverUrl + '/Encounter?patient=' + patientId + '&_count=' + maxCount + '&_sort=-date';
    var wrappedUrl = wrapWithProxy(url);

    console.log('Searching for available encounters for patient:', patientId);

    // Get access token
    var accessToken = null;
    if (smart.state && smart.state.tokenResponse) {
      if (smart.state.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.access_token;
      } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.tokenResponse.access_token;
      }
    }

    return fetch(wrappedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        'Authorization': accessToken ? 'Bearer ' + accessToken : ''
      }
    })
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to search encounters: ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(function(data) {
      if (data.entry && data.entry.length > 0) {
        var encounters = data.entry.map(function(entry) {
          var encounter = entry.resource;
          
          // Extract encounter details
          var type = 'N/A';
          if (encounter.type && encounter.type[0]) {
            type = encounter.type[0].text || 
                   (encounter.type[0].coding && encounter.type[0].coding[0] && encounter.type[0].coding[0].display) ||
                   (encounter.type[0].coding && encounter.type[0].coding[0] && encounter.type[0].coding[0].code) ||
                   'N/A';
          }
          
          var status = encounter.status || 'Unknown';
          
          var dateRange = 'N/A';
          if (encounter.period) {
            var start = encounter.period.start ? new Date(encounter.period.start).toLocaleDateString() : '';
            var end = encounter.period.end ? new Date(encounter.period.end).toLocaleDateString() : '';
            if (start && end) {
              dateRange = start + ' to ' + end;
            } else if (start) {
              dateRange = 'From ' + start;
            }
          }
          
          var reason = 'N/A';
          if (encounter.reasonCode && encounter.reasonCode[0]) {
            reason = encounter.reasonCode[0].text || 
                    (encounter.reasonCode[0].coding && encounter.reasonCode[0].coding[0] && encounter.reasonCode[0].coding[0].display) ||
                    'N/A';
          }
          
          return {
            id: encounter.id,
            type: type,
            status: status,
            dateRange: dateRange,
            reason: reason,
            display: type + ' | ' + status + ' | ' + dateRange + ' (ID: ' + encounter.id + ')'
          };
        });
        console.log('Found ' + encounters.length + ' encounters:', encounters);
        return encounters;
      } else {
        console.log('No encounters found');
        return [];
      }
    })
    .catch(function(error) {
      console.error('Error searching for encounters:', error);
      throw error;
    });
  };

  /**
   * Create a new Encounter resource in the EHR
   * @param {Object} encounterData - Encounter data object
   * @param {string} encounterData.status - Encounter status (e.g., 'planned', 'arrived', 'in-progress', 'finished', 'cancelled')
   * @param {string} encounterData.class - Encounter class code (e.g., 'AMB', 'EMER', 'IMP', 'OBSENC', 'PRENC', 'SS', 'VR')
   * @param {string} encounterData.type - Encounter type code (e.g., 'AMB', 'EMER', 'IMP')
   * @param {string} encounterData.reasonCode - Reason for encounter (optional)
   * @param {string} encounterData.startDate - Start date/time in ISO format (optional)
   * @param {string} encounterData.endDate - End date/time in ISO format (optional)
   * @returns {Promise} Promise that resolves with the created encounter or rejects with error
   */
  window.createEncounter = function(encounterData) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var patientId = smart.patient.id;
    var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';

    // Build the Encounter resource according to FHIR R4 specification
    // Cerner requires period with start date at minimum
    var now = new Date();
    var startDate = encounterData.startDate;
    
    // Ensure startDate is in proper ISO 8601 format with time
    if (startDate) {
      // If it's already a string, validate it's ISO format
      if (typeof startDate === 'string') {
        // If it doesn't have time component, add it
        if (startDate.indexOf('T') === -1) {
          startDate = startDate + 'T00:00:00Z';
        }
        // Ensure it ends with Z or timezone
        if (!startDate.endsWith('Z') && !startDate.match(/[+-]\d{2}:\d{2}$/)) {
          startDate = startDate + 'Z';
        }
      } else {
        // If it's a Date object, convert to ISO string
        startDate = new Date(startDate).toISOString();
      }
    } else {
      // Default to current time
      startDate = now.toISOString();
    }
    
    var endDate = encounterData.endDate || null;
    if (endDate) {
      // Ensure endDate is in proper ISO 8601 format
      if (typeof endDate === 'string') {
        if (endDate.indexOf('T') === -1) {
          endDate = endDate + 'T00:00:00Z';
        }
        if (!endDate.endsWith('Z') && !endDate.match(/[+-]\d{2}:\d{2}$/)) {
          endDate = endDate + 'Z';
        }
      } else {
        endDate = new Date(endDate).toISOString();
      }
    }

    // According to Cerner documentation:
    // - class field cannot be written directly (it's inferred)
    // - location OR serviceProvider is REQUIRED (one or the other, not both)
    // - period with start date is required
    // Cerner documentation example uses "in-progress" status
    // Note: "cancelled" and "entered-in-error" are not supported per Cerner docs
    var encounterStatus = encounterData.status || 'in-progress';
    
    // Validate status - Cerner doesn't support "cancelled" or "entered-in-error" for creation
    if (encounterStatus === 'cancelled' || encounterStatus === 'entered-in-error') {
      console.warn('Status "' + encounterStatus + '" is not supported by Cerner for encounter creation. Using "in-progress" instead.');
      encounterStatus = 'in-progress';
    }
    
    var encounter = {
      resourceType: 'Encounter',
      status: encounterStatus,
      // Period is required by Cerner - always include it with start date
      period: {
        start: startDate
      },
      subject: {
        reference: 'Patient/' + patientId
      }
    };
    
    // Note: class field is NOT included - Cerner docs say "Direct writing of class is not supported. 
    // This field is inferred on a write."

    // Add end date if provided
    if (endDate) {
      encounter.period.end = endDate;
    }

    // Add type - Only include if explicitly provided with a valid coding system
    // Cerner supports HL7 V2 Code System: http://terminology.hl7.org/CodeSystem/v2-0004
    // Common codes: O (Outpatient), I (Inpatient), E (Emergency), etc.
    // Note: The 'class' field may be sufficient, so type is optional
    if (encounterData.type && encounterData.type.trim() !== '') {
      var encounterType = encounterData.type.trim();
      var typeSystem = encounterData.typeSystem || 'http://terminology.hl7.org/CodeSystem/v2-0004';
      var typeDisplay = encounterData.typeDisplay;
      
      // Map common class codes to HL7 V2 codes if needed
      if (!typeDisplay) {
        var typeMap = {
          'AMB': 'O',  // Ambulatory -> Outpatient
          'EMER': 'E', // Emergency
          'IMP': 'I',  // Inpatient
          'OBSENC': 'O', // Observation -> Outpatient
          'PRENC': 'P', // Pre-admission
          'SS': 'O',   // Short stay -> Outpatient
          'VR': 'O'    // Virtual -> Outpatient
        };
        // If the type looks like a class code, try to map it
        if (typeMap[encounterType]) {
          encounterType = typeMap[encounterType];
          typeSystem = 'http://terminology.hl7.org/CodeSystem/v2-0004';
        }
      }
      
      // Get proper display name for HL7 V2 codes
      var typeDisplayMap = {
        'O': 'Outpatient',
        'I': 'Inpatient',
        'E': 'Emergency',
        'P': 'Pre-admit',
        'R': 'Recurring patient',
        'B': 'Obstetrics',
        'C': 'Commercial Account',
        'N': 'Not Applicable',
        'U': 'Unknown'
      };
      
      var finalTypeDisplay = typeDisplay || typeDisplayMap[encounterType] || getClassDisplay(encounterType);
      
      // According to FHIR spec, type should have both coding and text for better display
      encounter.type = [{
        coding: [{
          system: typeSystem,
          code: encounterType,
          display: finalTypeDisplay
        }],
        text: finalTypeDisplay  // Add text field for better display in EHR systems
      }];
    }

    // Add reason code if provided
    // According to Cerner docs: "ICD-10 and SNOMED codes with text fields are supported"
    // So we should include both coding and text for best compatibility
    if (encounterData.reasonCode && encounterData.reasonCode.trim() !== '') {
      var reasonCode = encounterData.reasonCode.trim();
      var reasonDisplay = encounterData.reasonDisplay || reasonCode;
      
      // SNOMED CT codes are numeric - if numeric, use SNOMED coding
      if (/^\d+$/.test(reasonCode)) {
        // Valid SNOMED CT numeric code - include both coding and text
        encounter.reasonCode = [{
          coding: [{
            system: 'http://snomed.info/sct',
            code: reasonCode,
            display: reasonDisplay
          }],
          text: reasonDisplay  // Also include text for better display
        }];
      } else {
        // Not a valid SNOMED code - use text field (per Cerner docs, text is supported)
        // But also try to include it as a coding if it looks like an ICD-10 code
        var reasonCodeObj = {
          text: reasonCode  // Always include text
        };
        
        // If it looks like an ICD-10 code (starts with letter and has numbers), add coding
        if (/^[A-Z]\d{2}/.test(reasonCode)) {
          reasonCodeObj.coding = [{
            system: 'http://hl7.org/fhir/sid/icd-10',
            code: reasonCode,
            display: reasonDisplay
          }];
        }
        
        encounter.reasonCode = [reasonCodeObj];
      }
    }

    // According to Cerner docs: location OR serviceProvider is REQUIRED
    // Only one is permitted - cannot provide both
    // If location is provided, use it; otherwise use serviceProvider
    if (encounterData.location) {
      // Normalize location reference format
      var locationRef = encounterData.location.trim();
      // If user entered just an ID (numbers only), prepend "Location/"
      if (/^\d+$/.test(locationRef)) {
        locationRef = 'Location/' + locationRef;
      } else if (!locationRef.startsWith('Location/')) {
        // If it doesn't start with Location/, add it
        locationRef = 'Location/' + locationRef;
      }
      
      console.log('Location reference (normalized):', locationRef);
      
      encounter.location = [{
        location: {
          reference: locationRef
        }
      }];
    } else if (encounterData.serviceProvider) {
      // Normalize serviceProvider reference format
      var serviceProviderRef = encounterData.serviceProvider.trim();
      // If user entered just an ID (numbers only), prepend "Organization/"
      if (/^\d+$/.test(serviceProviderRef)) {
        serviceProviderRef = 'Organization/' + serviceProviderRef;
      } else if (!serviceProviderRef.startsWith('Organization/')) {
        // If it doesn't start with Organization/, add it
        serviceProviderRef = 'Organization/' + serviceProviderRef;
      }
      
      console.log('ServiceProvider reference (normalized):', serviceProviderRef);
      
      // Use serviceProvider if location not provided
      encounter.serviceProvider = {
        reference: serviceProviderRef
      };
    } else {
      // If neither provided, this is a critical error - Cerner requires one of these
      var errorMsg = 'ERROR: Either location OR serviceProvider is REQUIRED by Cerner. Please provide one of these fields.';
      console.error('=== VALIDATION ERROR ===');
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg));
    }

    // Participant is OPTIONAL per Cerner docs - only add if explicitly provided
    // We don't auto-add it from token because the Practitioner ID might not exist
    var participantRef = null;
    
    // Only use participant if explicitly provided in encounter data
    if (encounterData.practitioner && encounterData.practitioner.trim() !== '') {
      participantRef = encounterData.practitioner.trim();
    }
    
    // Only add participant if we have a valid, properly formatted reference
    // Note: We skip auto-adding from token to avoid "not found" errors
    if (participantRef) {
      // Normalize participant reference format
      // Must be Practitioner/ID or RelatedPerson/ID
      var normalizedParticipantRef = participantRef.trim();
      
      // Remove any URL prefix if present (e.g., "https://fhir-ehr-code.cerner.com/r4/.../Practitioner/123")
      if (normalizedParticipantRef.includes('/Practitioner/')) {
        var parts = normalizedParticipantRef.split('/Practitioner/');
        normalizedParticipantRef = 'Practitioner/' + parts[parts.length - 1];
      } else if (normalizedParticipantRef.includes('/RelatedPerson/')) {
        var parts = normalizedParticipantRef.split('/RelatedPerson/');
        normalizedParticipantRef = 'RelatedPerson/' + parts[parts.length - 1];
      }
      // If it's just a number, assume it's a Practitioner
      else if (/^\d+$/.test(normalizedParticipantRef)) {
        normalizedParticipantRef = 'Practitioner/' + normalizedParticipantRef;
      } 
      // If it doesn't start with Practitioner/ or RelatedPerson/, try to fix it
      else if (!normalizedParticipantRef.startsWith('Practitioner/') && 
               !normalizedParticipantRef.startsWith('RelatedPerson/')) {
        // If it has a slash but wrong prefix, try to extract the ID
        if (normalizedParticipantRef.includes('/')) {
          var parts = normalizedParticipantRef.split('/');
          if (parts.length >= 2) {
            // Take the last part as the ID and assume Practitioner
            normalizedParticipantRef = 'Practitioner/' + parts[parts.length - 1];
          } else {
            normalizedParticipantRef = 'Practitioner/' + normalizedParticipantRef;
          }
        } else {
          normalizedParticipantRef = 'Practitioner/' + normalizedParticipantRef;
        }
      }
      
      console.log('Participant reference (normalized):', normalizedParticipantRef);
      
      // Only add if it's properly formatted
      if (normalizedParticipantRef.startsWith('Practitioner/') || 
          normalizedParticipantRef.startsWith('RelatedPerson/')) {
        encounter.participant = [{
          type: [{
            coding: [{
              system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
              code: 'ATND',
              display: 'attending'
            }]
          }],
          individual: {
            reference: normalizedParticipantRef
          }
        }];
      } else {
        console.warn('Skipping participant - reference format is invalid:', normalizedParticipantRef);
        console.warn('Participant is optional per Cerner docs, so continuing without it');
      }
    } else {
      console.log('No participant provided - this is optional per Cerner docs');
    }

    // Validate required fields before sending
    var validationErrors = [];
    if (!encounter.resourceType) {
      validationErrors.push('resourceType is required');
    }
    if (!encounter.status) {
      validationErrors.push('status is required');
    }
    if (!encounter.period || !encounter.period.start) {
      validationErrors.push('period.start is required');
    }
    if (!encounter.subject || !encounter.subject.reference) {
      validationErrors.push('subject is required');
    }
    if (!encounter.location && !encounter.serviceProvider) {
      validationErrors.push('location OR serviceProvider is required');
    }
    
    if (validationErrors.length > 0) {
      var errorMsg = 'Validation failed: ' + validationErrors.join(', ');
      console.error('=== VALIDATION ERROR ===');
      console.error(errorMsg);
      console.error('Encounter object:', encounter);
      return Promise.reject(new Error(errorMsg));
    }

    console.log('=== ENCOUNTER CREATION DEBUG ===');
    console.log('Creating encounter:', JSON.stringify(encounter, null, 2));
    console.log('Patient ID:', patientId);
    console.log('FHIR Version:', fhirVersion);
    console.log('Participant included:', !!encounter.participant);
    console.log('Location included:', !!encounter.location);
    console.log('ServiceProvider included:', !!encounter.serviceProvider);
    console.log('Period start:', encounter.period.start);
    console.log('Period end:', encounter.period.end || 'not set');

    // Build the URL
    var url = smart.state.serverUrl + '/Encounter';
    var wrappedUrl = wrapWithProxy(url);

    console.log('POST URL:', wrappedUrl);
    console.log('Full request body (stringified):', JSON.stringify(encounter));
    console.log('Request body size:', JSON.stringify(encounter).length, 'bytes');

    // Get access token from smart client - try multiple locations
    var accessToken = null;
    if (smart.state && smart.state.tokenResponse) {
      if (smart.state.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.access_token;
      } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.tokenResponse.access_token;
      }
    }
    
    // Also try to get from the API's auth object if available
    if (!accessToken && smart.api && smart.api.state && smart.api.state.tokenResponse) {
      accessToken = smart.api.state.tokenResponse.access_token;
    }

    console.log('Access token available:', !!accessToken);
    if (!accessToken) {
      console.warn('WARNING: No access token found. Request may fail.');
    }

    // Clean up the encounter object - remove any undefined or null values that might cause issues
    var cleanEncounter = JSON.parse(JSON.stringify(encounter));
    
    console.log('Cleaned encounter (no undefined/null):', JSON.stringify(cleanEncounter, null, 2));
    
    // Log the exact request that will be sent
    var requestBody = JSON.stringify(cleanEncounter);
    var requestHeaders = {
      'Content-Type': 'application/fhir+json',
      'Accept': 'application/fhir+json',
      'Authorization': accessToken ? 'Bearer ' + (accessToken.substring(0, 20) + '...') : 'NOT SET'
    };
    
    console.log('=== REQUEST DETAILS ===');
    console.log('Method: POST');
    console.log('URL:', wrappedUrl);
    console.log('Headers:', requestHeaders);
    console.log('Body:', requestBody);
    console.log('Body length:', requestBody.length, 'bytes');
    
    // Compare with Cerner's example structure
    console.log('=== STRUCTURE CHECK ===');
    console.log('Has resourceType:', !!cleanEncounter.resourceType, '=', cleanEncounter.resourceType);
    console.log('Has status:', !!cleanEncounter.status, '=', cleanEncounter.status);
    console.log('Has period:', !!cleanEncounter.period);
    console.log('Has period.start:', !!(cleanEncounter.period && cleanEncounter.period.start), '=', cleanEncounter.period?.start);
    console.log('Has subject:', !!cleanEncounter.subject);
    console.log('Has subject.reference:', !!(cleanEncounter.subject && cleanEncounter.subject.reference), '=', cleanEncounter.subject?.reference);
    console.log('Has location:', !!cleanEncounter.location, '=', JSON.stringify(cleanEncounter.location));
    console.log('Has serviceProvider:', !!cleanEncounter.serviceProvider, '=', JSON.stringify(cleanEncounter.serviceProvider));
    console.log('Has type:', !!cleanEncounter.type);
    console.log('Has participant:', !!cleanEncounter.participant);
    console.log('Has reasonCode:', !!cleanEncounter.reasonCode);

    // Use fetch API with proper authentication
    return fetch(wrappedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
        'Authorization': accessToken ? 'Bearer ' + accessToken : ''
      },
      body: requestBody
    })
    .then(function(response) {
      console.log('=== RESPONSE RECEIVED ===');
      console.log('Response status:', response.status);
      console.log('Response status text:', response.statusText);
      console.log('Response headers:', Array.from(response.headers.entries()));
      
      return response.text().then(function(text) {
        console.log('Response body (raw):', text);
        
        var data;
        try {
          data = JSON.parse(text);
          console.log('Response body (parsed):', JSON.stringify(data, null, 2));
        } catch (e) {
          console.warn('Failed to parse response as JSON:', e);
          data = { raw: text };
        }
        
        if (!response.ok) {
          console.error('=== ERROR RESPONSE DETAILS ===');
          console.error('Status:', response.status, response.statusText);
          console.error('OperationOutcome:', JSON.stringify(data, null, 2));
          
          var error = new Error('Failed to create encounter: ' + response.status + ' ' + response.statusText);
          error.status = response.status;
          error.statusText = response.statusText;
          error.responseJSON = data;
          
          // Extract detailed error messages
          if (data.issue && data.issue.length > 0) {
            var errorMessages = [];
            data.issue.forEach(function(issue) {
              var msg = '';
              if (issue.details && issue.details.text) {
                msg = issue.details.text;
              }
              if (issue.diagnostics) {
                msg += (msg ? ' - ' : '') + issue.diagnostics;
              }
              if (issue.expression && issue.expression.length > 0) {
                msg += (msg ? ' (Field: ' : 'Field: ') + issue.expression.join(', ') + ')';
              }
              if (issue.location && issue.location.length > 0) {
                msg += (msg ? ' (Location: ' : 'Location: ') + issue.location.join(', ') + ')';
              }
              if (msg) {
                errorMessages.push(msg);
              }
            });
            if (errorMessages.length > 0) {
              error.message = errorMessages.join('; ');
              
              // Add helpful suggestions for common errors
              var fullErrorMsg = error.message.toLowerCase();
              if (fullErrorMsg.includes('location') && (fullErrorMsg.includes('not found') || fullErrorMsg.includes('not supported'))) {
                error.message += '\n\n💡 Tip: The Location ID does not exist in this system.';
                error.message += '\n   • Try using Service Provider (Organization) instead';
                error.message += '\n   • Or find a valid Location ID by querying Location resources';
                error.message += '\n   • Note: Example IDs from Cerner docs may not work in SMART Health IT sandbox';
              } else if (fullErrorMsg.includes('practitioner') && (fullErrorMsg.includes('not found') || fullErrorMsg.includes('not supported'))) {
                error.message += '\n\n💡 Tip: The Practitioner ID does not exist in this system.';
                error.message += '\n   • Participant is optional - try creating the encounter without it';
                error.message += '\n   • Or use a valid Practitioner ID from this system';
              } else if (fullErrorMsg.includes('serviceprovider') || fullErrorMsg.includes('organization')) {
                error.message += '\n\n💡 Tip: The Organization ID does not exist in this system.';
                error.message += '\n   • Try using Location instead';
                error.message += '\n   • Or find a valid Organization ID by querying Organization resources';
              }
            }
          }
          
          throw error;
        }
        
        console.log('=== SUCCESS ===');
        console.log('Encounter created successfully:', data);
        return data;
      });
    })
    .catch(function(error) {
      console.error('=== ERROR RESPONSE ===');
      console.error('Error object:', error);
      console.error('Error message:', error.message);
      console.error('Error status:', error.status);
      console.error('Error responseJSON:', error.responseJSON);
      
      // Try to extract detailed error information
      var errorMessage = 'Failed to create encounter';
      var errorDetails = [];
      
      if (error.responseJSON) {
        var opOutcome = error.responseJSON;
        console.error('OperationOutcome:', JSON.stringify(opOutcome, null, 2));
        
        if (opOutcome.issue && opOutcome.issue.length > 0) {
          opOutcome.issue.forEach(function(issue, index) {
            console.error('Issue ' + index + ':', JSON.stringify(issue, null, 2));
            var detail = '';
            if (issue.details) {
              detail = issue.details.text || issue.details.coding?.[0]?.display || '';
            }
            if (issue.diagnostics) {
              detail += (detail ? ' - ' : '') + issue.diagnostics;
            }
            if (issue.expression && issue.expression.length > 0) {
              detail += (detail ? ' (Field: ' : 'Field: ') + issue.expression.join(', ') + ')';
            }
            if (detail) {
              errorDetails.push(detail);
            }
          });
        }
      }
      
      if (errorDetails.length > 0) {
        errorMessage = errorDetails.join('; ');
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      var finalError = new Error(errorMessage);
      finalError.status = error.status;
      finalError.statusText = error.statusText;
      finalError.responseJSON = error.responseJSON;
      finalError.originalError = error;
      
      console.error('Final error to throw:', finalError);
      throw finalError;
    });
  };

  // Helper function to get display name for encounter class
  function getClassDisplay(code) {
    var classMap = {
      'AMB': 'ambulatory',
      'EMER': 'emergency',
      'IMP': 'inpatient encounter',
      'OBSENC': 'observation encounter',
      'PRENC': 'pre-admission',
      'SS': 'short stay',
      'VR': 'virtual'
    };
    return classMap[code] || code;
  }

  window.extractData = function() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      
      // Display user-friendly error message
      var errorMessage = '<div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">';
      errorMessage += '<h2>🚫 Launch Error</h2>';
      errorMessage += '<p>This app needs to be launched from an EHR system.</p>';
      errorMessage += '<p><strong>For testing:</strong></p>';
      errorMessage += '<p><a href="https://launch.smarthealthit.org/v/r4/fhir" target="_blank" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Launch with SMART Health IT Sandbox</a></p>';
      errorMessage += '<p><small>Or launch from Cerner Code Console</small></p>';
      errorMessage += '</div>';
      
      document.body.innerHTML = errorMessage;
      ret.reject();
    }

    function onReady(smart)  {
           console.log('🚀 SMART client ready - Starting FH PA Dashboard');
           console.log('Server:', smart.state.serverUrl);
           console.log('Patient:', smart.patient.id);
           
           // Store SMART client globally for write operations
           window.smartClient = smart;
           
           if (smart.hasOwnProperty('patient') && smart.patient) {
        
        // Determine FHIR version
        var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';
        var patientId = smart.patient.id;
        
        // Helper to build URL with query params
        function buildUrl(resource, params) {
          var url = smart.state.serverUrl + '/' + resource;
          var queryParts = [];
          for (var key in params) {
            if (params.hasOwnProperty(key)) {
              queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
            }
          }
          if (queryParts.length > 0) {
            url += '?' + queryParts.join('&');
          }
          return wrapWithProxy(url);
        }
        
        // Helper to make request with timeout and retry
        function makeRequest(url, resourceName) {
          console.log('Fetching ' + resourceName + '...');
          return smart.request({
            url: url,
            headers: { Accept: "application/fhir+json" }
          }).catch(function(error) {
            console.warn('Failed to fetch ' + resourceName + ':', error.message || error);
            return null; // Return null instead of throwing
          });
        }
        
        // Build resource URLs based on FHIR version
        var medicationResource = fhirVersion === 'R2' ? 'MedicationOrder' : 'MedicationRequest';
        
        // 1. Load Patient Demographics
        smart.patient.read().then(function(patient) {
          var p = patient;
          if (patient.resourceType === 'Bundle' && patient.entry && patient.entry[0]) {
            p = patient.entry[0].resource;
          }
          
          var fullName = '';
          if (p.name && p.name[0]) {
            var given = Array.isArray(p.name[0].given) ? p.name[0].given.join(' ') : p.name[0].given || '';
            var family = Array.isArray(p.name[0].family) ? p.name[0].family.join(' ') : p.name[0].family || '';
            fullName = (given + ' ' + family).trim();
          }
          
          displayPatient(fullName || 'Unknown', p.gender || 'Unknown', p.birthDate || 'Unknown');
        }).catch(function(error) {
          console.warn('Patient load failed:', error);
          displayPatient('Unknown', 'Unknown', 'Unknown');
        });
        
        // 2. Load Observations
        var obvUrl = buildUrl('Observation', { patient: patientId, _count: 100 });
        makeRequest(obvUrl, 'Observations').then(function(bundle) {
          if (bundle && bundle.entry) {
            var observations = bundle.entry.map(function(e) { return e.resource; });
            displayAllObservations(observations);
          } else {
            $('#vitals').html('<p class="no-data">No observations available</p>');
          }
        });
        
        // 3. Load Medications  
        var medUrl = buildUrl(medicationResource, { patient: patientId, _count: 100 });
        makeRequest(medUrl, 'Medications').then(function(bundle) {
          if (bundle && bundle.entry) {
            var medications = bundle.entry.map(function(e) { return e.resource; });
            displayMedications(medications);
          } else {
            $('#meds').html('<p class="no-data">No medications available</p>');
          }
        });
        
        // 4. Load Allergies
        var allergyUrl = buildUrl('AllergyIntolerance', { patient: patientId, _count: 100 });
        makeRequest(allergyUrl, 'Allergies').then(function(bundle) {
          if (bundle && bundle.entry) {
            var allergies = bundle.entry.map(function(e) { return e.resource; });
            displayAllergies(allergies);
          } else {
            $('#allergies').html('<p class="no-data">No allergies available</p>');
          }
        });
        
        // 5. Load Conditions
        var conditionUrl = buildUrl('Condition', { patient: patientId, _count: 100 });
        makeRequest(conditionUrl, 'Conditions').then(function(bundle) {
          if (bundle && bundle.entry) {
            var conditions = bundle.entry.map(function(e) { return e.resource; });
            displayConditions(conditions);
          } else {
            $('#conditions').html('<p class="no-data">No conditions available</p>');
          }
        });
        
        // 6. Load Documents
        var docUrl = buildUrl('DocumentReference', { patient: patientId, _count: 100 });
        makeRequest(docUrl, 'Documents').then(function(bundle) {
          if (bundle && bundle.entry) {
            var documents = bundle.entry.map(function(e) { return e.resource; });
            displayDocuments(documents);
          } else {
            $('#documents').html('<p class="no-data">No clinical documents available</p>');
          }
        });
      } else {
        console.log('No patient context available');
        console.log('SMART client properties:', Object.keys(smart));
        onError();
      }
    }

    // Configure FHIR client for Oracle Health
    FHIR.oauth2.settings = {
      replaceBrowserHistory: true,
      completeInTarget: true
    };
    
    // Add error handling for missing state
    try {
    FHIR.oauth2.ready(onReady, onError);
    } catch (error) {
      console.log('FHIR client initialization error:', error);
      if (error.message && error.message.includes('No state found')) {
        console.log('No OAuth state found - this usually means the app needs to be launched from an EHR');
        console.log('For testing, use SMART Health IT sandbox: https://launch.smarthealthit.org/v/r4/fhir');
        onError();
      } else {
        onError();
      }
    }
    return ret.promise();

  };

  // Helper function to display patient demographics
  function displayPatient(fullName, gender, birthdate) {
    console.log('displayPatient called:', fullName, gender, birthdate);
    $('#holder').addClass('show');  // Show the main content
    $('#loading').hide();
    $('#fname').html(fullName.split(' ')[0] || '-');
    $('#lname').html(fullName.split(' ').slice(1).join(' ') || '-');
    $('#gender').html(toSentenceCase(gender) || '-');
    $('#birthdate').html(birthdate || '-');
    $('#patient-name-display').html(fullName || 'Patient');
  }
  
  function displayMedications(medications) {
    console.log('displayMedications called with', medications.length, 'items');
    var html = '';
    if (medications && medications.length > 0) {
      // Sort medications by last updated date (most recent first)
      var sortedMeds = medications.sort(function(a, b) {
        var dateA = new Date((a.meta && a.meta.lastUpdated) || a.authoredOn || 0);
        var dateB = new Date((b.meta && b.meta.lastUpdated) || b.authoredOn || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul>';
      sortedMeds.forEach(function(med) {
        var medName = 'Unknown';
        
        // Handle both R2 (MedicationOrder) and R4 (MedicationRequest) structures
        if (med.medicationCodeableConcept && med.medicationCodeableConcept.text) {
          medName = med.medicationCodeableConcept.text;
        } else if (med.medicationCodeableConcept && med.medicationCodeableConcept.coding && med.medicationCodeableConcept.coding[0]) {
          medName = med.medicationCodeableConcept.coding[0].display || med.medicationCodeableConcept.coding[0].code;
        } else if (med.medicationReference && med.medicationReference.display) {
          // R2 MedicationOrder might have medicationReference instead
          medName = med.medicationReference.display;
        }
        
        var status = formatStatus(med.status) || 'Unknown';
        var dosage = '';
        var intent = '';
        var priority = '';
        var authoredOn = '';
        var validFrom = '';
        var validUntil = '';
        
        // Handle dosage instructions (different structure in R2 vs R4)
        if (med.dosageInstruction && med.dosageInstruction[0] && med.dosageInstruction[0].text) {
          dosage = med.dosageInstruction[0].text;
        } else if (med.dosageInstruction && med.dosageInstruction[0] && med.dosageInstruction[0].doseQuantity) {
          // R2 might have doseQuantity instead of text
          var dose = med.dosageInstruction[0].doseQuantity;
          dosage = (dose.value || '') + ' ' + (dose.unit || '');
        }
        
        // Additional metadata
        if (med.intent) {
          intent = med.intent;
        }
        if (med.priority) {
          priority = med.priority;
        }
        if (med.authoredOn) {
          authoredOn = new Date(med.authoredOn).toLocaleDateString();
        }
        if (med.validityPeriod && med.validityPeriod.start) {
          validFrom = new Date(med.validityPeriod.start).toLocaleDateString();
        }
        if (med.validityPeriod && med.validityPeriod.end) {
          validUntil = new Date(med.validityPeriod.end).toLocaleDateString();
        }
        
        var meta = status;
        if (intent) meta += ' • ' + intent;
        if (priority) meta += ' • ' + priority;
        if (dosage) meta += ' • ' + dosage;
        if (authoredOn) meta += ' • Authored: ' + authoredOn;
        if (validFrom) meta += ' • Valid from: ' + validFrom;
        if (validUntil) meta += ' • Valid until: ' + validUntil;
        
        html += '<li><strong>' + medName + '</strong><div class="item-meta">' + meta + '</div></li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No medications available</span></div>';
    }
    $('#medications').html(html);
  }
  
  function displayAllergies(allergies) {
    var html = '';
    if (allergies && allergies.length > 0) {
      // Sort allergies by last updated date (most recent first)
      var sortedAllergies = allergies.sort(function(a, b) {
        var dateA = new Date((a.meta && a.meta.lastUpdated) || a.recordedDate || 0);
        var dateB = new Date((b.meta && b.meta.lastUpdated) || b.recordedDate || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul>';
      sortedAllergies.forEach(function(allergy) {
        var allergen = 'Unknown';
        
        // Handle both R2 and R4 AllergyIntolerance structures
        if (allergy.code && allergy.code.coding && allergy.code.coding.length > 0) {
          // Look through all coding entries to find one with a display name
          for (var i = 0; i < allergy.code.coding.length; i++) {
            var coding = allergy.code.coding[i];
            if (coding.display && coding.display.trim() !== '') {
              allergen = toSentenceCase(coding.display);
              break;
            }
          }
          // If no display name found, use the first code
          if (allergen === 'Unknown' && allergy.code.coding[0].code) {
            allergen = toSentenceCase(allergy.code.coding[0].code);
          }
        } else if (allergy.substance && allergy.substance.coding && allergy.substance.coding.length > 0) {
          // R2 might use substance instead of code
          for (var i = 0; i < allergy.substance.coding.length; i++) {
            var coding = allergy.substance.coding[i];
            if (coding.display && coding.display.trim() !== '') {
              allergen = toSentenceCase(coding.display);
              break;
            }
          }
          if (allergen === 'Unknown' && allergy.substance.coding[0].code) {
            allergen = toSentenceCase(allergy.substance.coding[0].code);
          }
        }
        
        var severity = 'Unknown';
        if (allergy.criticality) {
          severity = formatStatus(allergy.criticality);
        } else if (allergy.severity) {
          // R2 might use severity instead of criticality
          severity = formatStatus(allergy.severity);
        }
        
        var status = formatStatus(allergy.status) || 'Unknown';
        var recordedDate = '';
        var onsetDate = '';
        var category = '';
        var type = '';
        var reaction = '';
        
        // Additional metadata
        if (allergy.recordedDate) {
          recordedDate = new Date(allergy.recordedDate).toLocaleDateString();
        }
        if (allergy.onsetDateTime) {
          onsetDate = new Date(allergy.onsetDateTime).toLocaleDateString();
        }
        if (allergy.category && allergy.category[0]) {
          category = toSentenceCase(allergy.category[0]);
        }
        if (allergy.type) {
          type = toSentenceCase(allergy.type);
        }
        if (allergy.reaction && allergy.reaction[0] && allergy.reaction[0].manifestation && allergy.reaction[0].manifestation[0]) {
          reaction = toSentenceCase(allergy.reaction[0].manifestation[0].text || allergy.reaction[0].manifestation[0].coding[0].display);
        }
        
        var meta = status + ' • ' + severity;
        if (category) meta += ' • ' + category;
        if (type) meta += ' • ' + type;
        if (reaction) meta += ' • Reaction: ' + reaction;
        if (recordedDate) meta += ' • Recorded: ' + recordedDate;
        if (onsetDate) meta += ' • Onset: ' + onsetDate;
        
        html += '<li><strong>' + allergen + '</strong><div class="item-meta">' + meta + '</div></li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No allergies available</span></div>';
    }
    $('#allergies').html(html);
  }
  
  function displayConditions(conditions) {
    var html = '';
    if (conditions && conditions.length > 0) {
      // Sort conditions by onset date (most recent first)
      var sortedConditions = conditions.sort(function(a, b) {
        var dateA = new Date(a.onsetDateTime || (a.onsetPeriod && a.onsetPeriod.start) || a.recordedDate || 0);
        var dateB = new Date(b.onsetDateTime || (b.onsetPeriod && b.onsetPeriod.start) || b.recordedDate || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul>';
      sortedConditions.forEach(function(condition) {
        var conditionName = 'Unknown';
        
        // Try multiple approaches to get condition name
        if (condition.code) {
          // First priority: check for text field at code level
          if (condition.code.text && condition.code.text.trim() !== '') {
            conditionName = toSentenceCase(condition.code.text);
          }
          // Second priority: look through coding entries for display names
          else if (condition.code.coding && condition.code.coding.length > 0) {
            for (var i = 0; i < condition.code.coding.length; i++) {
              var coding = condition.code.coding[i];
              if (coding.display && coding.display.trim() !== '') {
                conditionName = toSentenceCase(coding.display);
                break;
              }
            }
            
            // If no display name found, use the first code
            if (conditionName === 'Unknown' && condition.code.coding[0].code) {
              conditionName = toSentenceCase(condition.code.coding[0].code);
            }
          }
        }
        
        // If we only got a code number, try to make it more readable
        if (conditionName && /^\d+$/.test(conditionName)) {
          conditionName = 'Condition ' + conditionName;
        }
        
        var status = 'Unknown';
        if (condition.clinicalStatus) {
          // R2 might have clinicalStatus as a string
          if (typeof condition.clinicalStatus === 'string') {
            status = formatStatus(condition.clinicalStatus);
          } else if (condition.clinicalStatus.coding && condition.clinicalStatus.coding[0]) {
            status = formatStatus(condition.clinicalStatus.coding[0].code);
          }
        } else if (condition.status) {
          // R2 might use status directly instead of clinicalStatus
          status = formatStatus(condition.status);
        }
        
        var severity = '';
        var category = '';
        var onsetDate = '';
        var abatementDate = '';
        var recordedDate = '';
        var verificationStatus = '';
        var stage = '';
        
        // Additional metadata
        if (condition.severity && condition.severity.coding && condition.severity.coding[0]) {
          severity = formatStatus(condition.severity.coding[0].code);
        }
        if (condition.category && condition.category[0] && condition.category[0].coding && condition.category[0].coding[0]) {
          category = toSentenceCase(condition.category[0].coding[0].code);
        }
        if (condition.onsetDateTime) {
          onsetDate = new Date(condition.onsetDateTime).toLocaleDateString();
        }
        if (condition.abatementDateTime) {
          abatementDate = new Date(condition.abatementDateTime).toLocaleDateString();
        }
        if (condition.recordedDate) {
          recordedDate = new Date(condition.recordedDate).toLocaleDateString();
        }
        if (condition.verificationStatus) {
          // R2 might have verificationStatus as a string
          if (typeof condition.verificationStatus === 'string') {
            verificationStatus = formatStatus(condition.verificationStatus);
          } else if (condition.verificationStatus.coding && condition.verificationStatus.coding[0]) {
            verificationStatus = formatStatus(condition.verificationStatus.coding[0].code);
          }
        }
        if (condition.stage && condition.stage[0] && condition.stage[0].summary && condition.stage[0].summary.coding && condition.stage[0].summary.coding[0]) {
          stage = toSentenceCase(condition.stage[0].summary.coding[0].code);
        }
        
        var meta = status;
        if (severity) meta += ' • ' + severity;
        if (category) meta += ' • ' + category;
        if (verificationStatus) meta += ' • ' + verificationStatus;
        if (stage) meta += ' • Stage: ' + stage;
        if (onsetDate) meta += ' • Onset: ' + onsetDate;
        if (abatementDate) meta += ' • Abated: ' + abatementDate;
        if (recordedDate) meta += ' • Recorded: ' + recordedDate;
        
        html += '<li><strong>' + conditionName + '</strong><div class="item-meta">' + meta + '</div></li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No conditions available</span></div>';
    }
    $('#conditions').html(html);
  }
  
  function displayDocuments(documents) {
    var html = '';
    if (documents && documents.length > 0) {
      // Sort documents by last updated date (most recent first)
      var sortedDocs = documents.sort(function(a, b) {
        var dateA = new Date((a.meta && a.meta.lastUpdated) || a.date || a.indexed || 0);
        var dateB = new Date((b.meta && b.meta.lastUpdated) || b.date || b.indexed || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul>';
      sortedDocs.forEach(function(doc) {
        var docType = 'Unknown';
        if (doc.type && doc.type.coding && doc.type.coding[0]) {
          docType = toSentenceCase(doc.type.coding[0].display || doc.type.coding[0].code);
        } else if (doc.class && doc.class.coding && doc.class.coding[0]) {
          // R2 might use class instead of type
          docType = toSentenceCase(doc.class.coding[0].display || doc.class.coding[0].code);
        }
        
        var date = 'Unknown date';
        var indexedDate = '';
        var createdDate = '';
        var status = '';
        var description = '';
        var category = '';
        var subject = '';
        var author = '';
        var custodian = '';
        var format = '';
        var size = '';
        
        // Additional metadata
        if (doc.date) {
          date = new Date(doc.date).toLocaleDateString();
        }
        if (doc.indexed) {
          // R2 might use indexed instead of date
          indexedDate = new Date(doc.indexed).toLocaleDateString();
        }
        if (doc.created) {
          createdDate = new Date(doc.created).toLocaleDateString();
        }
        if (doc.status) {
          status = formatStatus(doc.status);
        }
        if (doc.description) {
          description = toSentenceCase(doc.description);
        }
        if (doc.category && doc.category[0] && doc.category[0].coding && doc.category[0].coding[0]) {
          category = toSentenceCase(doc.category[0].coding[0].code);
        }
        if (doc.subject && doc.subject.display) {
          subject = toSentenceCase(doc.subject.display);
        }
        if (doc.author && doc.author[0] && doc.author[0].display) {
          author = toSentenceCase(doc.author[0].display);
        }
        if (doc.custodian && doc.custodian.display) {
          custodian = toSentenceCase(doc.custodian.display);
        }
        if (doc.content && doc.content[0] && doc.content[0].format && doc.content[0].format.coding && doc.content[0].format.coding[0]) {
          format = toSentenceCase(doc.content[0].format.coding[0].code);
        }
        if (doc.content && doc.content[0] && doc.content[0].attachment && doc.content[0].attachment.size) {
          size = Math.round(doc.content[0].attachment.size / 1024) + ' KB';
        }
        
        var meta = '';
        if (status) meta += status;
        if (date) meta += (meta ? ' • ' : '') + 'Date: ' + date;
        if (indexedDate) meta += (meta ? ' • ' : '') + 'Indexed: ' + indexedDate;
        if (createdDate) meta += (meta ? ' • ' : '') + 'Created: ' + createdDate;
        if (category) meta += (meta ? ' • ' : '') + category;
        if (format) meta += (meta ? ' • ' : '') + format;
        if (size) meta += (meta ? ' • ' : '') + size;
        if (description) meta += (meta ? ' • ' : '') + description;
        if (subject) meta += (meta ? ' • ' : '') + 'Subject: ' + subject;
        if (author) meta += (meta ? ' • ' : '') + 'Author: ' + author;
        if (custodian) meta += (meta ? ' • ' : '') + 'Custodian: ' + custodian;
        
        html += '<li><strong>' + docType + '</strong><div class="item-meta">' + meta + '</div></li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No documents available</span></div>';
    }
    $('#documents').html(html);
  }

  // Helper function to format observation values
  function formatObservationValue(obs) {
    if (obs.valueQuantity) {
      var value = obs.valueQuantity.value;
      var unit = obs.valueQuantity.unit || obs.valueQuantity.code || '';
      
      // Round to appropriate decimal places based on unit
      if (unit === 'cm' || unit === 'kg') {
        value = Math.round(value * 10) / 10; // 1 decimal
      } else if (unit === 'mm[Hg]') {
        value = Math.round(value); // Whole number
      } else if (unit === 'mg/dL' || unit === 'g/dL') {
        value = Math.round(value * 10) / 10; // 1 decimal
      } else {
        value = Math.round(value * 100) / 100; // 2 decimals default
      }
      
      return value + ' ' + unit;
    } else if (obs.valueCodeableConcept) {
      return obs.valueCodeableConcept.text || (obs.valueCodeableConcept.coding && obs.valueCodeableConcept.coding[0] && obs.valueCodeableConcept.coding[0].display) || 'Unknown';
    } else if (obs.valueString) {
      return obs.valueString;
    } else if (obs.valueBoolean !== undefined) {
      return obs.valueBoolean.toString();
    } else if (obs.component && obs.component.length > 0) {
      // Handle multi-component observations (like blood pressure)
      return obs.component.map(function(comp) {
        var compName = (comp.code && comp.code.coding && comp.code.coding[0] && comp.code.coding[0].display) || 'Component';
        var compValue = (comp.valueQuantity && comp.valueQuantity.value) || 'N/A';
        var compUnit = (comp.valueQuantity && comp.valueQuantity.unit) || '';
        if (compUnit === 'mm[Hg]') {
          compValue = Math.round(compValue);
        }
        return compName + ': ' + compValue + ' ' + compUnit;
      }).join(', ');
    }
    return 'No value';
  }

  function displayAllObservations(observations) {
    console.log('displayAllObservations called with', observations ? observations.length : 0, 'items');
    var html = '';
    if (observations && observations.length > 0) {
      // Sort observations by lastUpdated date (most recent first)
      var sortedObservations = observations.sort(function(a, b) {
        var dateA = new Date((a.meta && a.meta.lastUpdated) || a.effectiveDateTime || a.issued || 0);
        var dateB = new Date((b.meta && b.meta.lastUpdated) || b.effectiveDateTime || b.issued || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul>';
      sortedObservations.forEach(function(obs) {
        // Get the observation name/type
        var obsName = 'Unknown';
        if (obs.code && obs.code.coding && obs.code.coding[0]) {
          obsName = obs.code.coding[0].display || obs.code.text || obs.code.coding[0].code;
        }
        
        // Get the value
        var value = formatObservationValue(obs);
        
        // Get the date
        var date = obs.effectiveDateTime || obs.issued || (obs.meta && obs.meta.lastUpdated) || 'Unknown date';
        var formattedDate = new Date(date).toLocaleDateString();
        
        html += '<li><strong>' + obsName + ': ' + value + '</strong><div class="item-meta">Date: ' + formattedDate + '</div></li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No observations available</span></div>';
    }
    $('#vitals').html(html);
  }


})(window);

