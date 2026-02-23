(function(window){
  // CORS Proxy configuration
  // Proxy is only needed for Cerner requests when running on deployed domains
  // On localhost, Cerner may allow CORS, so proxy isn't needed
  // SMART Health IT and other sandboxes never need the proxy
  var PROXY_URL = 'http://localhost:8081/';  // CORS proxy endpoint
  
  // Helper function to determine if we should use proxy
  function shouldUseProxy(url) {
    // Only proxy Cerner URLs
    var isCernerUrl = url.includes('fhir-ehr-code.cerner.com') || 
                      url.includes('fhir-ehr.cerner.com') ||
                      url.includes('cerner.com');
    
    if (!isCernerUrl) {
      return false; // Never proxy non-Cerner URLs
    }
    
    // For Cerner URLs, only use proxy when NOT on localhost
    // On localhost, Cerner may allow CORS, so proxy isn't needed
    var isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' ||
                      window.location.hostname === '';
    
    // Use proxy for Cerner only when deployed (not localhost)
    return !isLocalhost;
  }
  
  // Helper function to wrap URLs with proxy
  function wrapWithProxy(url) {
    if (shouldUseProxy(url)) {
      console.log('[PROXY] Wrapping Cerner URL with proxy (deployed environment):', url);
      return PROXY_URL + url;
    }
    
    // For localhost or non-Cerner URLs, return as-is
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
   * Get medications associated with a specific encounter
   * @param {string} encounterId - The ID of the encounter
   * @returns {Promise} Promise that resolves with medications for that encounter
   */
  window.getMedicationsByEncounter = function(encounterId) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';
    var medicationResource = fhirVersion === 'R2' ? 'MedicationOrder' : 'MedicationRequest';
    
    // Query medications filtered by encounter
    // For R4, use 'encounter' parameter; for R2, use 'context' parameter
    var searchParam = fhirVersion === 'R2' ? 'context' : 'encounter';
    var url = smart.state.serverUrl + '/' + medicationResource + '?' + searchParam + '=' + encounterId + '&_count=100';
    var wrappedUrl = wrapWithProxy(url);

    console.log('Fetching medications for encounter:', encounterId);
    console.log('FHIR Version:', fhirVersion);
    console.log('Search parameter:', searchParam);
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

    // Use AbortController for timeout if available, otherwise use Promise.race
    var controller = null;
    var timeoutId = null;
    
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      timeoutId = setTimeout(function() {
        controller.abort();
      }, 30000); // 30 second timeout
    }

    var fetchPromise = fetch(wrappedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        'Authorization': accessToken ? 'Bearer ' + accessToken : ''
      },
      signal: controller ? controller.signal : undefined
    })
    .then(function(response) {
      if (timeoutId) clearTimeout(timeoutId);
      return response;
    })
    .catch(function(error) {
      if (timeoutId) clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout: Medication query took too long (>30 seconds). The server may be slow or the query may be too complex.');
      }
      throw error;
    });

    // If no AbortController, add a timeout wrapper
    if (!controller) {
      var timeoutPromise = new Promise(function(resolve, reject) {
        setTimeout(function() {
          reject(new Error('Request timeout: Medication query took too long (>30 seconds)'));
        }, 30000);
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    }
    
    return fetchPromise
    .then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to fetch medications: ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(function(data) {
      var medications = [];
      if (data.entry && data.entry.length > 0) {
        medications = data.entry.map(function(entry) {
          return entry.resource;
        });
      }
      console.log('Found ' + medications.length + ' medications for encounter ' + encounterId);
      return medications;
    })
    .catch(function(error) {
      console.error('Error fetching medications for encounter:', error);
      throw error;
    });
  };

  /**
   * Fulfill a medication by updating its status and creating a MedicationDispense resource
   * @param {string} medicationRequestId - The ID of the MedicationRequest to fulfill
   * @param {Object} medicationRequest - The full MedicationRequest resource
   * @param {Object} options - Optional fulfillment details (quantity, daysSupply, etc.)
   * @returns {Promise} Promise that resolves when fulfillment is complete
   */
  window.fulfillMedication = function(medicationRequestId, medicationRequest, options) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';
    
    // Get access token
    var accessToken = null;
    if (smart.state && smart.state.tokenResponse) {
      if (smart.state.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.access_token;
      } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.tokenResponse.access_token;
      }
    }

    if (!accessToken) {
      return Promise.reject(new Error('No access token available'));
    }

    console.log('=== FULFILLING MEDICATION ===');
    console.log('MedicationRequest ID:', medicationRequestId);
    console.log('FHIR Version:', fhirVersion);

    // Step 1: Update MedicationRequest status to "completed" (R4) or "completed" (R2)
    var updateStatusPromise;
    if (fhirVersion === 'R4') {
      // For R4, update MedicationRequest status
      var medicationRequestUrl = smart.state.serverUrl + '/MedicationRequest/' + medicationRequestId;
      var wrappedMedUrl = wrapWithProxy(medicationRequestUrl);

      // First, read the current MedicationRequest to get its version
      return fetch(wrappedMedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
          'Authorization': 'Bearer ' + accessToken
        }
      })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Failed to read MedicationRequest: ' + response.status);
        }
        return response.json();
      })
      .then(function(currentMedRequest) {
        // Update status to completed
        currentMedRequest.status = 'completed';
        
        // Add note about fulfillment (Annotation structure)
        if (!currentMedRequest.note) {
          currentMedRequest.note = [];
        }
        var fulfillmentTime = new Date().toISOString();
        currentMedRequest.note.push({
          text: 'Fulfilled by FH VPharmacy',
          time: fulfillmentTime,
          authorString: 'FH VPharmacy'
        });
        
        // Update with If-Match header for version control
        var versionId = currentMedRequest.meta?.versionId || '*';
        
        console.log('Updating MedicationRequest status to completed with note...');
        console.log('MedicationRequest with note:', JSON.stringify(currentMedRequest, null, 2));
        return fetch(wrappedMedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/fhir+json',
            'Accept': 'application/fhir+json',
            'Authorization': 'Bearer ' + accessToken,
            'If-Match': versionId
          },
          body: JSON.stringify(currentMedRequest)
        });
      })
      .then(function(response) {
        if (!response.ok) {
          return response.json().then(function(errorData) {
            throw new Error('Failed to update MedicationRequest: ' + JSON.stringify(errorData));
          });
        }
        return response.json();
      })
      .then(function(updatedMedRequest) {
        console.log('MedicationRequest updated successfully');
        console.log('Updated MedicationRequest:', JSON.stringify(updatedMedRequest, null, 2));
        
        // Step 2: Create MedicationDispense resource
        return createMedicationDispense(medicationRequest, options)
          .then(function(dispense) {
            // Return both the updated request and the dispense
            return {
              medicationRequest: updatedMedRequest,
              medicationDispense: dispense
            };
          })
          .catch(function(error) {
            // Even if MedicationDispense fails, the MedicationRequest was updated
            console.warn('MedicationRequest updated but MedicationDispense creation failed:', error);
            return {
              medicationRequest: updatedMedRequest,
              medicationDispense: null,
              warning: 'MedicationRequest updated but MedicationDispense creation failed: ' + error.message
            };
          });
      });
    } else {
      // For R2, MedicationOrder status update might work differently
      // For now, just create the dispense record
      console.log('R2 detected - creating MedicationDispense only');
      return createMedicationDispense(medicationRequest, options);
    }
  };

  /**
   * Create a MedicationDispense resource to record medication fulfillment
   * @param {Object} medicationRequest - The MedicationRequest that was fulfilled
   * @param {Object} options - Optional fulfillment details
   * @returns {Promise} Promise that resolves with the created MedicationDispense
   */
  function createMedicationDispense(medicationRequest, options) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized'));
    }

    var smart = window.smartClient;
    var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';
    var patientId = smart.patient.id;

    // Get access token
    var accessToken = null;
    if (smart.state && smart.state.tokenResponse) {
      if (smart.state.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.access_token;
      } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.tokenResponse.access_token;
      }
    }

    // Build MedicationDispense resource
    var medicationDispense = {
      resourceType: 'MedicationDispense',
      status: 'completed',
      medicationCodeableConcept: medicationRequest.medicationCodeableConcept || {
        text: 'Medication from ' + (medicationRequest.medicationCodeableConcept?.text || 'prescription')
      },
      subject: {
        reference: 'Patient/' + patientId
      },
      performer: [{
        actor: {
          display: 'FH VPharmacy (Placeholder)',
          type: 'Organization'
        }
      }],
      whenHandedOver: new Date().toISOString(),
      quantity: options?.quantity || {
        value: 1,
        unit: 'package'
      },
      daysSupply: options?.daysSupply || 30,
      note: [{
        text: 'Fulfilled by FH VPharmacy'
      }]
    };

    // Link to the MedicationRequest
    if (medicationRequest.id) {
      medicationDispense.authorizingPrescription = [{
        reference: 'MedicationRequest/' + medicationRequest.id
      }];
    }

    // Link to encounter if present
    if (medicationRequest.encounter && medicationRequest.encounter.reference) {
      medicationDispense.context = {
        reference: medicationRequest.encounter.reference
      };
    } else if (medicationRequest.context && medicationRequest.context.reference) {
      medicationDispense.context = {
        reference: medicationRequest.context.reference
      };
    }

    // Add dosage instructions if available
    if (medicationRequest.dosageInstruction && medicationRequest.dosageInstruction.length > 0) {
      medicationDispense.dosageInstruction = medicationRequest.dosageInstruction;
    }

    console.log('Creating MedicationDispense:', JSON.stringify(medicationDispense, null, 2));

    var url = smart.state.serverUrl + '/MedicationDispense';
    var wrappedUrl = wrapWithProxy(url);

    return fetch(wrappedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/fhir+json',
        'Accept': 'application/fhir+json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify(medicationDispense)
    })
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(errorData) {
          console.error('Error creating MedicationDispense:', errorData);
          throw new Error('Failed to create MedicationDispense: ' + JSON.stringify(errorData));
        });
      }
      return response.json();
    })
    .then(function(dispense) {
      console.log('MedicationDispense created successfully:', dispense.id);
      console.log('Created MedicationDispense:', JSON.stringify(dispense, null, 2));
      return dispense;
    })
    .catch(function(error) {
      console.error('Error creating MedicationDispense:', error);
      // Re-throw so the caller can handle it
      throw error;
    });
  }

  /**
   * Get MedicationDispense resources for a specific MedicationRequest
   * @param {string} medicationRequestId - The ID of the MedicationRequest
   * @returns {Promise} Promise that resolves with MedicationDispense resources
   */
  window.getMedicationDispenses = function(medicationRequestId) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var url = smart.state.serverUrl + '/MedicationDispense?authorizingPrescription=MedicationRequest/' + medicationRequestId + '&_count=100';
    var wrappedUrl = wrapWithProxy(url);

    console.log('Fetching MedicationDispense for MedicationRequest:', medicationRequestId);

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
        throw new Error('Failed to fetch MedicationDispense: ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(function(data) {
      var dispenses = [];
      if (data.entry && data.entry.length > 0) {
        dispenses = data.entry.map(function(entry) {
          return entry.resource;
        });
      }
      console.log('Found ' + dispenses.length + ' MedicationDispense resources for MedicationRequest ' + medicationRequestId);
      return dispenses;
    })
    .catch(function(error) {
      console.error('Error fetching MedicationDispense:', error);
      throw error;
    });
  };

  /**
   * Get all MedicationDispense resources for the current patient
   * @param {string} patientId - The ID of the patient (optional, uses current patient if not provided)
   * @param {number} count - Maximum number of results to return (default: 100)
   * @returns {Promise} Promise that resolves with MedicationDispense resources
   */
  window.getAllMedicationDispenses = function(patientId, count) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    
    // Use provided patientId or get from SMART client
    if (!patientId && smart.patient && smart.patient.id) {
      patientId = smart.patient.id;
    }
    
    if (!patientId) {
      return Promise.reject(new Error('Patient ID is required'));
    }

    var maxCount = count || 100;
    var url = smart.state.serverUrl + '/MedicationDispense?patient=' + patientId + '&_count=' + maxCount;
    var wrappedUrl = wrapWithProxy(url);

    console.log('Fetching all MedicationDispense resources for patient:', patientId);

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
        throw new Error('Failed to fetch MedicationDispense: ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(function(data) {
      var dispenses = [];
      if (data.entry && data.entry.length > 0) {
        dispenses = data.entry.map(function(entry) {
          return entry.resource;
        });
      }
      console.log('Found ' + dispenses.length + ' MedicationDispense resources for patient ' + patientId);
      return dispenses;
    })
    .catch(function(error) {
      console.error('Error fetching MedicationDispense:', error);
      throw error;
    });
  };

  /**
   * Display MedicationDispense resources in a formatted, readable view
   * @param {Array} dispenses - Array of MedicationDispense resources
   */
  window.displayMedicationDispenses = function(dispenses) {
    var html = '';
    
    if (!dispenses || dispenses.length === 0) {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No medication dispenses found</span></div>';
      $('#medication-dispense-report').html(html);
      return;
    }

    // Sort by whenPrepared date (most recent first)
    var sortedDispenses = dispenses.slice().sort(function(a, b) {
      var dateA = a.whenPrepared ? new Date(a.whenPrepared) : new Date(0);
      var dateB = b.whenPrepared ? new Date(b.whenPrepared) : new Date(0);
      return dateB - dateA;
    });

    html = '<ul style="list-style: none; padding: 0; margin: 0;">';
    
    sortedDispenses.forEach(function(dispense) {
      var dispenseId = dispense.id || 'Unknown';
      
      // Extract medication name
      var medicationName = 'Unknown Medication';
      if (dispense.medicationCodeableConcept && dispense.medicationCodeableConcept.text) {
        medicationName = dispense.medicationCodeableConcept.text;
      } else if (dispense.medicationCodeableConcept && dispense.medicationCodeableConcept.coding && dispense.medicationCodeableConcept.coding[0]) {
        medicationName = dispense.medicationCodeableConcept.coding[0].display || dispense.medicationCodeableConcept.coding[0].code;
      } else if (dispense.medicationReference) {
        medicationName = dispense.medicationReference.display || dispense.medicationReference.reference;
      }
      
      // Extract status
      var status = dispense.status || 'Unknown';
      var statusClass = status === 'completed' ? 'success' : (status === 'preparation' ? 'warning' : 'info');
      
      // Extract category
      var category = '-';
      if (dispense.category && dispense.category.coding && dispense.category.coding[0]) {
        category = dispense.category.coding[0].display || dispense.category.coding[0].code;
      } else if (dispense.category && dispense.category.text) {
        category = dispense.category.text;
      }
      
      // Extract quantity
      var quantity = '-';
      if (dispense.quantity) {
        quantity = (dispense.quantity.value || '') + ' ' + (dispense.quantity.unit || '');
      }
      
      // Extract dates
      var whenPrepared = '-';
      if (dispense.whenPrepared) {
        whenPrepared = new Date(dispense.whenPrepared).toLocaleString();
      }
      
      var whenHandedOver = '-';
      if (dispense.whenHandedOver) {
        whenHandedOver = new Date(dispense.whenHandedOver).toLocaleString();
      } else if (dispense._whenHandedOver && dispense._whenHandedOver.extension) {
        var dataAbsentReason = dispense._whenHandedOver.extension.find(function(ext) {
          return ext.url === 'http://hl7.org/fhir/StructureDefinition/data-absent-reason';
        });
        if (dataAbsentReason && dataAbsentReason.valueCode) {
          whenHandedOver = dataAbsentReason.valueCode;
        }
      }
      
      // Extract performer
      var performer = '-';
      if (dispense.performer && dispense.performer.length > 0) {
        var performers = dispense.performer.map(function(p) {
          if (p.actor && p.actor.display) {
            return p.actor.display;
          } else if (p.actor && p.actor.reference) {
            return p.actor.reference;
          }
          return null;
        }).filter(function(p) { return p !== null; });
        if (performers.length > 0) {
          performer = performers.join(', ');
        }
      }
      
      // Extract location
      var location = '-';
      if (dispense.location && dispense.location.display) {
        location = dispense.location.display;
      } else if (dispense.location && dispense.location.reference) {
        location = dispense.location.reference;
      }
      
      // Extract authorizing prescription
      var authorizingPrescription = '-';
      if (dispense.authorizingPrescription && dispense.authorizingPrescription.length > 0) {
        var prescriptions = dispense.authorizingPrescription.map(function(p) {
          return p.reference || '-';
        });
        authorizingPrescription = prescriptions.join(', ');
      }
      
      // Extract type
      var type = '-';
      if (dispense.type && dispense.type.coding && dispense.type.coding[0]) {
        type = dispense.type.coding[0].display || dispense.type.coding[0].code;
      } else if (dispense.type && dispense.type.text) {
        type = dispense.type.text;
      }
      
      // Build meta information
      var meta = 'Status: ' + status;
      if (category !== '-') meta += ' • Category: ' + category;
      if (type !== '-') meta += ' • Type: ' + type;
      if (whenPrepared !== '-') meta += ' • Prepared: ' + whenPrepared;
      
      // Build collapsible details content (formatted, readable view)
      var detailsHtml = formatMedicationDispenseDetails(dispense);
      
      var detailsId = 'dispense-details-' + dispenseId;
      
      html += '<li class="dispense-list-item" style="margin-bottom: 10px; border-radius: 4px; border: 1px solid #e0e0e0; padding: 8px 10px; background: #fff;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="dispense-header" data-dispense-details-id="' + detailsId + '">' +
                  '<div style="flex: 1;">' +
                    '<strong>' + medicationName + '</strong>' +
                    '<div class="item-meta" style="margin-top: 4px; font-size: 0.9em; color: #666;">' + meta + '</div>' +
                  '</div>' +
                  '<div style="display: flex; align-items: center; gap: 8px; margin-left: 8px;">' +
                    '<span class="badge badge-' + statusClass + '" style="padding: 4px 8px; border-radius: 4px; font-size: 0.8em; font-weight: 600;">' + status.toUpperCase() + '</span>' +
                    '<button type="button" class="dispense-details-toggle" data-dispense-details-id="' + detailsId + '" style="padding: 3px 8px; font-size: 0.8em; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; cursor: pointer;">' +
                      '<span class="dispense-details-toggle-text">Details</span>' +
                    '</button>' +
                  '</div>' +
                '</div>' +
                '<div id="' + detailsId + '" class="dispense-details" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e0e0e0; font-size: 0.85em; max-height: 400px; overflow: auto; background: #f8f9fa; border-radius: 4px; padding: 12px;">' +
                  detailsHtml +
                '</div>' +
              '</li>';
    });
    
    html += '</ul>';
    $('#medication-dispense-report').html(html);
  };

  /**
   * Helper function to format MedicationDispense details in a readable way
   * @param {Object} dispense - MedicationDispense resource
   * @returns {string} HTML string with formatted details
   */
  function formatMedicationDispenseDetails(dispense) {
    if (!dispense) return '<p>No dispense data available</p>';
    
    var html = '<div style="display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; font-size: 0.9em;">';
    
    // Helper to format a field
    function addField(label, value, isMultiline) {
      if (value === null || value === undefined || value === '') {
        value = '<span style="color: #999; font-style: italic;">-</span>';
      }
      var valueStyle = isMultiline ? 'grid-column: 2; white-space: pre-wrap; word-break: break-word;' : 'grid-column: 2;';
      html += '<div style="font-weight: 600; color: #495057;">' + label + ':</div>';
      html += '<div style="' + valueStyle + ' color: #212529;">' + value + '</div>';
    }
    
    // Basic Information
    html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 8px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Basic Information</div>';
    addField('Resource ID', dispense.id);
    addField('Resource Type', dispense.resourceType);
    addField('Status', dispense.status);
    if (dispense.category) {
      var categoryText = dispense.category.text || (dispense.category.coding && dispense.category.coding[0] ? (dispense.category.coding[0].display || dispense.category.coding[0].code) : '-');
      addField('Category', categoryText);
    }
    if (dispense.type) {
      var typeText = dispense.type.text || (dispense.type.coding && dispense.type.coding[0] ? (dispense.type.coding[0].display || dispense.type.coding[0].code) : '-');
      addField('Type', typeText);
    }
    
    // Medication Information
    html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Medication Information</div>';
    if (dispense.medicationCodeableConcept) {
      if (dispense.medicationCodeableConcept.text) addField('Medication Name', dispense.medicationCodeableConcept.text);
      if (dispense.medicationCodeableConcept.coding && dispense.medicationCodeableConcept.coding.length > 0) {
        var codings = dispense.medicationCodeableConcept.coding.map(function(c) {
          return (c.display || c.code) + (c.system ? ' (' + c.system + ')' : '');
        }).join('<br>');
        addField('Coding', codings, true);
      }
    }
    if (dispense.medicationReference) {
      addField('Medication Reference', dispense.medicationReference.reference || dispense.medicationReference.display);
    }
    
    // Quantity and Dates
    html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Dispense Details</div>';
    if (dispense.quantity) {
      var qtyText = (dispense.quantity.value || '') + ' ' + (dispense.quantity.unit || '');
      if (dispense.quantity.system) qtyText += ' (' + dispense.quantity.system + ')';
      addField('Quantity', qtyText);
    }
    if (dispense.whenPrepared) {
      addField('When Prepared', new Date(dispense.whenPrepared).toLocaleString());
    }
    if (dispense.whenHandedOver) {
      addField('When Handed Over', new Date(dispense.whenHandedOver).toLocaleString());
    } else if (dispense._whenHandedOver && dispense._whenHandedOver.extension) {
      var dataAbsentReason = dispense._whenHandedOver.extension.find(function(ext) {
        return ext.url === 'http://hl7.org/fhir/StructureDefinition/data-absent-reason';
      });
      if (dataAbsentReason && dataAbsentReason.valueCode) {
        addField('When Handed Over', dataAbsentReason.valueCode);
      }
    }
    
    // Performer
    if (dispense.performer && dispense.performer.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Performer</div>';
      dispense.performer.forEach(function(perf, idx) {
        if (idx > 0) html += '<div style="grid-column: 1 / -1; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #dee2e6;"></div>';
        if (perf.actor) {
          if (perf.actor.display) addField('Name', perf.actor.display);
          if (perf.actor.reference) addField('Reference', perf.actor.reference);
          if (perf.actor.type) addField('Type', perf.actor.type);
        }
      });
    }
    
    // Location
    if (dispense.location) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Location</div>';
      if (dispense.location.display) addField('Location Name', dispense.location.display);
      if (dispense.location.reference) addField('Location Reference', dispense.location.reference);
    }
    
    // Authorizing Prescription
    if (dispense.authorizingPrescription && dispense.authorizingPrescription.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Authorizing Prescription</div>';
      dispense.authorizingPrescription.forEach(function(prescription, idx) {
        if (idx > 0) html += '<div style="grid-column: 1 / -1; margin-top: 8px;"></div>';
        if (prescription.reference) addField('Prescription ' + (idx + 1), prescription.reference);
      });
    }
    
    // Encounter/Context
    if (dispense.context || dispense.encounter) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Encounter</div>';
      if (dispense.context && dispense.context.reference) addField('Context Reference', dispense.context.reference);
      if (dispense.encounter && dispense.encounter.reference) addField('Encounter Reference', dispense.encounter.reference);
    }
    
    // Subject
    if (dispense.subject) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Subject</div>';
      if (dispense.subject.display) addField('Patient Name', dispense.subject.display);
      if (dispense.subject.reference) addField('Patient Reference', dispense.subject.reference);
    }
    
    // Dosage Instructions
    if (dispense.dosageInstruction && dispense.dosageInstruction.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Dosage Instructions</div>';
      dispense.dosageInstruction.forEach(function(dosage, idx) {
        if (idx > 0) html += '<div style="grid-column: 1 / -1; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #dee2e6;"></div>';
        if (dosage.text) addField('Instructions', dosage.text, true);
        if (dosage.route && dosage.route.coding && dosage.route.coding[0]) {
          addField('Route', (dosage.route.coding[0].display || dosage.route.coding[0].code) + (dosage.route.coding[0].system ? ' (' + dosage.route.coding[0].system + ')' : ''));
        }
        if (dosage.doseAndRate && dosage.doseAndRate[0]) {
          var dose = dosage.doseAndRate[0];
          if (dose.doseQuantity) {
            addField('Dose', (dose.doseQuantity.value || '') + ' ' + (dose.doseQuantity.unit || ''));
          }
          if (dose.rateQuantity) {
            addField('Rate', (dose.rateQuantity.value || '') + ' ' + (dose.rateQuantity.unit || ''));
          }
        }
        if (dosage.timing) {
          if (dosage.timing.repeat) {
            var timing = '';
            if (dosage.timing.repeat.frequency) timing += dosage.timing.repeat.frequency + 'x';
            if (dosage.timing.repeat.period) timing += ' every ' + dosage.timing.repeat.period + ' ' + (dosage.timing.repeat.periodUnit || '');
            if (timing) addField('Frequency', timing);
          }
          if (dosage.timing.code && dosage.timing.code.text) {
            addField('Schedule', dosage.timing.code.text);
          }
        }
      });
    }
    
    // Notes
    if (dispense.note && dispense.note.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Notes</div>';
      dispense.note.forEach(function(note, idx) {
        if (idx > 0) html += '<div style="grid-column: 1 / -1; margin-top: 8px;"></div>';
        if (note.text) addField('Note ' + (idx + 1), note.text, true);
        if (note.authorString) addField('Author', note.authorString);
        if (note.time) addField('Time', new Date(note.time).toLocaleString());
      });
    }
    
    // Meta Information
    if (dispense.meta) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Meta Information</div>';
      if (dispense.meta.lastUpdated) addField('Last Updated', new Date(dispense.meta.lastUpdated).toLocaleString());
      if (dispense.meta.versionId) addField('Version', dispense.meta.versionId);
      if (dispense.meta.profile && dispense.meta.profile.length > 0) {
        addField('Profile', dispense.meta.profile.join('<br>'), true);
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Search all MedicationDispense resources in the sandbox (without patient filter)
   * @param {number} count - Maximum number of results to return (default: 100)
   * @returns {Promise} Promise that resolves with MedicationDispense resources
   */
  window.searchAllMedicationDispenses = function(count) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var maxCount = count || 100;
    
    // Search without patient filter to get all dispenses
    var url = smart.state.serverUrl + '/MedicationDispense?_count=' + maxCount;
    var wrappedUrl = wrapWithProxy(url);

    console.log('Searching all MedicationDispense resources in sandbox...');

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
        throw new Error('Failed to search MedicationDispense: ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(function(data) {
      var dispenses = [];
      if (data.entry && data.entry.length > 0) {
        dispenses = data.entry.map(function(entry) {
          return entry.resource;
        });
      }
      console.log('Found ' + dispenses.length + ' MedicationDispense resources');
      return dispenses;
    })
    .catch(function(error) {
      console.error('Error searching MedicationDispense:', error);
      throw error;
    });
  };

  /**
   * Search all Patients in the sandbox (bulk read)
   * @param {number} count - Maximum number of results to return (default: 100)
   * @returns {Promise} Promise that resolves with Patient resources
   */
  window.searchAllPatients = function(count) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var maxCount = count || 100;
    
    // Search all patients (may require system-level scopes)
    var url = smart.state.serverUrl + '/Patient?_count=' + maxCount;
    var wrappedUrl = wrapWithProxy(url);

    console.log('Searching all Patient resources in sandbox...');

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
        // If we get 403 or similar, it means we don't have system-level access
        throw new Error('Failed to search all Patients: ' + response.status + ' ' + response.statusText + ' (May require system-level scopes)');
      }
      return response.json();
    })
    .then(function(data) {
      var patients = [];
      if (data.entry && data.entry.length > 0) {
        patients = data.entry.map(function(entry) {
          return entry.resource;
        });
      }
      console.log('Found ' + patients.length + ' Patient resources');
      return patients;
    })
    .catch(function(error) {
      console.error('Error searching all Patients:', error);
      throw error;
    });
  };

  /**
   * Check if a patient has MedicationDispense resources
   * @param {string} patientId - Patient ID to check
   * @returns {Promise} Promise that resolves with array of MedicationDispense resources (empty if none)
   */
  window.checkPatientForDispenses = function(patientId) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var smart = window.smartClient;
    var url = smart.state.serverUrl + '/MedicationDispense?patient=' + patientId + '&_count=1';
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

    return fetch(wrappedUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json',
        'Authorization': accessToken ? 'Bearer ' + accessToken : ''
      }
    })
    .then(function(response) {
      if (!response.ok) {
        // If patient-scoped, we might not have access to other patients
        return { entry: [] };
      }
      return response.json();
    })
    .then(function(data) {
      var dispenses = [];
      if (data.entry && data.entry.length > 0) {
        dispenses = data.entry.map(function(entry) {
          return entry.resource;
        });
      }
      return dispenses;
    })
    .catch(function(error) {
      console.warn('Error checking patient ' + patientId + ' for dispenses:', error);
      return []; // Return empty array on error
    });
  };

  /**
   * Find all patients with MedicationDispense resources using bulk patient search
   * This is a fallback when direct MedicationDispense search returns empty
   * Strategy: Since we can search all patients (system-level access), we'll:
   * 1. Get all patients
   * 2. Try searching all MedicationDispense again (might work with system access)
   * 3. Match dispenses to patients
   * 4. If that doesn't work, we know there are no dispenses in the sandbox
   * @param {number} maxPatients - Maximum number of patients to check (default: 50)
   * @returns {Promise} Promise that resolves with object containing patients and dispenseCounts
   */
  window.findPatientsWithDispensesBulk = function(maxPatients) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    var max = maxPatients || 50;
    
    console.log('Attempting bulk patient search approach...');
    
    // Step 1: Get all patients
    return window.searchAllPatients(max)
      .then(function(patients) {
        if (!patients || patients.length === 0) {
          console.log('No patients found in sandbox');
          return { patients: [], dispenseCounts: {} };
        }
        
        console.log('Found ' + patients.length + ' patients. Now trying to search all MedicationDispense resources...');
        
        // Step 2: Since we have system-level access (can search all patients),
        // try searching all MedicationDispense again - it might work now
        return window.searchAllMedicationDispenses(500) // Try a larger count
          .then(function(allDispenses) {
            console.log('Found ' + (allDispenses ? allDispenses.length : 0) + ' MedicationDispense resources via system search');
            
            if (!allDispenses || allDispenses.length === 0) {
              // No dispenses found even with system access - they don't exist in sandbox
              console.log('No MedicationDispense resources found in sandbox (even with system-level access)');
              return { patients: [], dispenseCounts: {} };
            }
            
            // Step 3: Extract patient IDs from dispenses and match with patients we found
            var patientIdSet = new Set();
            var dispenseCounts = {};
            
            allDispenses.forEach(function(dispense) {
              if (dispense.subject && dispense.subject.reference) {
                var match = dispense.subject.reference.match(/^Patient\/(.+)$/);
                if (match && match[1]) {
                  var patientId = match[1];
                  patientIdSet.add(patientId);
                  dispenseCounts[patientId] = (dispenseCounts[patientId] || 0) + 1;
                }
              }
            });
            
            var patientIdsWithDispenses = Array.from(patientIdSet);
            console.log('Found ' + patientIdsWithDispenses.length + ' unique patients with medication dispenses');
            
            // Step 4: Match patients we found with those who have dispenses
            var patientsWithDispenses = patients.filter(function(patient) {
              return patientIdsWithDispenses.includes(patient.id);
            });
            
            console.log('Matched ' + patientsWithDispenses.length + ' patients with their demographics');
            
            return {
              patients: patientsWithDispenses,
              dispenseCounts: dispenseCounts
            };
          })
          .catch(function(dispenseError) {
            console.warn('Could not search all MedicationDispense (may require system scopes):', dispenseError);
            // If we can't search all dispenses, we can't determine which patients have them
            // Return empty result with helpful message
            return { 
              patients: [], 
              dispenseCounts: {},
              error: 'Unable to search MedicationDispense resources. May require system-level scopes (system/MedicationDispense.read)'
            };
          });
      })
      .catch(function(error) {
        console.error('Error in bulk patient search:', error);
        throw error;
      });
  };

  /**
   * Get unique patient IDs from MedicationDispense resources
   * @param {Array} dispenses - Array of MedicationDispense resources
   * @returns {Array} Array of unique patient IDs
   */
  window.extractPatientIdsFromDispenses = function(dispenses) {
    var patientIds = new Set();
    
    dispenses.forEach(function(dispense) {
      if (dispense.subject && dispense.subject.reference) {
        // Extract patient ID from reference like "Patient/12345"
        var match = dispense.subject.reference.match(/^Patient\/(.+)$/);
        if (match && match[1]) {
          patientIds.add(match[1]);
        }
      }
    });
    
    return Array.from(patientIds);
  };

  /**
   * Fetch patient demographics for multiple patient IDs
   * @param {Array} patientIds - Array of patient IDs
   * @returns {Promise} Promise that resolves with array of patient resources
   */
  window.fetchPatientsDemographics = function(patientIds) {
    if (!window.smartClient) {
      return Promise.reject(new Error('SMART client not initialized. Please launch the app from an EHR.'));
    }

    if (!patientIds || patientIds.length === 0) {
      return Promise.resolve([]);
    }

    var smart = window.smartClient;
    
    // Get access token
    var accessToken = null;
    if (smart.state && smart.state.tokenResponse) {
      if (smart.state.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.access_token;
      } else if (smart.state.tokenResponse.tokenResponse && smart.state.tokenResponse.tokenResponse.access_token) {
        accessToken = smart.state.tokenResponse.tokenResponse.access_token;
      }
    }

    // Fetch all patients in parallel
    var patientPromises = patientIds.map(function(patientId) {
      var url = smart.state.serverUrl + '/Patient/' + patientId;
      var wrappedUrl = wrapWithProxy(url);
      
      return fetch(wrappedUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/fhir+json',
          'Authorization': accessToken ? 'Bearer ' + accessToken : ''
        }
      })
      .then(function(response) {
        if (!response.ok) {
          console.warn('Failed to fetch patient ' + patientId + ': ' + response.status);
          return null;
        }
        return response.json();
      })
      .catch(function(error) {
        console.warn('Error fetching patient ' + patientId + ':', error);
        return null;
      });
    });

    return Promise.all(patientPromises).then(function(patients) {
      // Filter out null results (failed fetches)
      return patients.filter(function(p) { return p !== null; });
    });
  };

  /**
   * Display patients with medication dispenses and their basic demographics
   * @param {Array} patients - Array of Patient resources
   * @param {Object} dispenseCounts - Object mapping patient ID to number of dispenses
   */
  window.displayPatientsWithDispenses = function(patients, dispenseCounts) {
    var html = '';
    
    if (!patients || patients.length === 0) {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No patients with medication dispenses found</span></div>';
      $('#patients-with-dispenses').html(html);
      return;
    }

    // Sort patients by name
    var sortedPatients = patients.slice().sort(function(a, b) {
      var nameA = '';
      var nameB = '';
      
      if (a.name && a.name[0]) {
        var givenA = Array.isArray(a.name[0].given) ? a.name[0].given.join(' ') : (a.name[0].given || '');
        var familyA = Array.isArray(a.name[0].family) ? a.name[0].family.join(' ') : (a.name[0].family || '');
        nameA = (familyA + ', ' + givenA).toLowerCase();
      }
      
      if (b.name && b.name[0]) {
        var givenB = Array.isArray(b.name[0].given) ? b.name[0].given.join(' ') : (b.name[0].given || '');
        var familyB = Array.isArray(b.name[0].family) ? b.name[0].family.join(' ') : (b.name[0].family || '');
        nameB = (familyB + ', ' + givenB).toLowerCase();
      }
      
      return nameA.localeCompare(nameB);
    });

    html = '<div style="margin-bottom: 12px; padding: 8px; background: #e7f3ff; border-radius: 4px; font-size: 0.9em;">';
    html += '<strong>Found ' + patients.length + ' patient' + (patients.length !== 1 ? 's' : '') + ' with medication dispenses</strong>';
    html += '</div>';
    html += '<ul style="list-style: none; padding: 0; margin: 0;">';
    
    sortedPatients.forEach(function(patient) {
      var patientId = patient.id || 'Unknown';
      
      // Extract name
      var firstName = '-';
      var middleName = '';
      var lastName = '-';
      var fullName = 'Unknown Patient';
      
      if (patient.name && patient.name[0]) {
        var givenArr = Array.isArray(patient.name[0].given) ? patient.name[0].given : (patient.name[0].given ? [patient.name[0].given] : []);
        var familyVal = Array.isArray(patient.name[0].family) ? patient.name[0].family.join(' ') : (patient.name[0].family || '');
        
        if (givenArr.length > 0) {
          firstName = givenArr[0];
        }
        if (givenArr.length > 1) {
          middleName = givenArr.slice(1).join(' ');
        }
        lastName = familyVal || '-';
        
        var nameParts = [];
        if (lastName !== '-') nameParts.push(lastName);
        if (firstName !== '-') nameParts.push(firstName);
        if (middleName) nameParts.push(middleName);
        fullName = nameParts.join(', ') || 'Unknown Patient';
      }
      
      // Extract gender
      var gender = patient.gender || '-';
      if (gender !== '-') {
        gender = gender.charAt(0).toUpperCase() + gender.slice(1);
      }
      
      // Extract birth date
      var birthDate = patient.birthDate || '-';
      
      // Extract address
      var address = '-';
      var city = '-';
      var state = '-';
      var zip = '-';
      
      if (patient.address && patient.address[0]) {
        var addr = patient.address[0];
        if (addr.line && addr.line.length > 0) {
          address = addr.line[0] || '-';
        }
        city = addr.city || '-';
        state = addr.state || '-';
        zip = addr.postalCode || '-';
      }
      
      // Extract phone
      var phone = '-';
      if (patient.telecom) {
        var phoneContact = patient.telecom.find(function(t) {
          return t.system === 'phone';
        });
        if (phoneContact && phoneContact.value) {
          phone = phoneContact.value;
        }
      }
      
      // Extract email
      var email = '-';
      if (patient.telecom) {
        var emailContact = patient.telecom.find(function(t) {
          return t.system === 'email';
        });
        if (emailContact && emailContact.value) {
          email = emailContact.value;
        }
      }
      
      // Get dispense count
      var dispenseCount = dispenseCounts && dispenseCounts[patientId] ? dispenseCounts[patientId] : 0;
      
      // Patient status
      var status = patient.active === false ? 'Inactive' : 'Active';
      var statusClass = patient.active === false ? 'warning' : 'success';
      
      html += '<li style="margin-bottom: 12px; border-radius: 4px; border: 1px solid #e0e0e0; padding: 12px; background: #fff;">';
      html += '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">';
      html += '<div style="flex: 1;">';
      html += '<div style="font-size: 1.1em; font-weight: 600; color: #007bff; margin-bottom: 4px;">' + fullName + '</div>';
      html += '<div style="font-size: 0.85em; color: #666; margin-top: 4px;">';
      html += '<span style="margin-right: 12px;"><strong>Patient ID:</strong> ' + patientId + '</span>';
      html += '<span class="badge badge-' + statusClass + '" style="padding: 2px 6px; border-radius: 3px; font-size: 0.8em; font-weight: 600; margin-right: 12px;">' + status + '</span>';
      html += '<span><strong>Dispenses:</strong> ' + dispenseCount + '</span>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
      
      // Demographics grid
      html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0; font-size: 0.9em;">';
      html += '<div><strong style="color: #666;">Gender:</strong> ' + gender + '</div>';
      html += '<div><strong style="color: #666;">Date of Birth:</strong> ' + birthDate + '</div>';
      if (address !== '-') {
        html += '<div><strong style="color: #666;">Address:</strong> ' + address;
        if (city !== '-') html += ', ' + city;
        if (state !== '-') html += ', ' + state;
        if (zip !== '-') html += ' ' + zip;
        html += '</div>';
      }
      if (phone !== '-') {
        html += '<div><strong style="color: #666;">Phone:</strong> ' + phone + '</div>';
      }
      if (email !== '-') {
        html += '<div><strong style="color: #666;">Email:</strong> ' + email + '</div>';
      }
      html += '</div>';
      
      html += '</li>';
    });
    
    html += '</ul>';
    $('#patients-with-dispenses').html(html);
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
          
          // Store the raw patient for later use if needed
          if (typeof window !== 'undefined') {
            window.currentPatient = p;
          }
          
          displayPatient(fullName || 'Unknown', p.gender || 'Unknown', p.birthDate || 'Unknown', p);
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
            
            // Store medications globally for filtering
            if (typeof window !== 'undefined') {
              window.allMedications = medications;
            }
            
            displayMedications(medications);
            
            // Populate encounter filter dropdown
            populateEncounterFilter(medications);
            
            // Populate prescription card with first active medication
            if (medications.length > 0) {
              console.log('Populating prescription card with medication:', medications[0]);
              try {
                populatePrescriptionCard(medications[0], smart, patientId, buildUrl, makeRequest, wrapWithProxy);
              } catch (error) {
                console.error('Error populating prescription card:', error);
              }
            }
          } else {
            $('#medications').html('<p class="no-data">No medications available</p>');
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
        
        // 5.5. Load Consents
        var consentUrl = buildUrl('Consent', { patient: patientId, _count: 100 });
        makeRequest(consentUrl, 'Consents').then(function(bundle) {
          if (bundle && bundle.entry) {
            var consents = bundle.entry.map(function(e) { return e.resource; });
            displayConsents(consents);
            // Store consents globally for search
            if (typeof window !== 'undefined') {
              window.allConsents = consents;
            }
          } else {
            $('#consents').html('<p class="no-data">No consents available</p>');
            if (typeof window !== 'undefined') {
              window.allConsents = [];
            }
          }
        }).catch(function(error) {
          console.warn('Error loading consents:', error);
          $('#consents').html('<p class="no-data">Unable to load consents. This resource may not be available in this system.</p>');
          if (typeof window !== 'undefined') {
            window.allConsents = [];
          }
        });
        
        // 5.6. Load Coverage
        var coverageUrl = buildUrl('Coverage', { beneficiary: patientId, _count: 100 });
        makeRequest(coverageUrl, 'Coverage').then(function(bundle) {
          if (bundle && bundle.entry) {
            var coverages = bundle.entry.map(function(e) { return e.resource; });
            displayCoverage(coverages);
          } else {
            $('#coverage').html('<p class="no-data">No coverage available</p>');
          }
        }).catch(function(error) {
          console.warn('Error loading coverage:', error);
          $('#coverage').html('<p class="no-data">Unable to load coverage. This resource may not be available in this system.</p>');
        });
        
        // 6. Load MedicationDispense Report
        var dispenseUrl = buildUrl('MedicationDispense', { patient: patientId, _count: 100 });
        makeRequest(dispenseUrl, 'MedicationDispense').then(function(bundle) {
          if (bundle && bundle.entry) {
            var dispenses = bundle.entry.map(function(e) { return e.resource; });
            if (typeof window.displayMedicationDispenses === 'function') {
              window.displayMedicationDispenses(dispenses);
            }
          } else {
            $('#medication-dispense-report').html('<p class="no-data">No medication dispenses available</p>');
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
  function displayPatient(fullName, gender, birthdate, patient) {
    console.log('displayPatient called:', fullName, gender, birthdate, patient);
    $('#holder').addClass('show');  // Show the main content
    $('#loading').hide();
    
    // Basic fields
    var safeFullName = fullName || 'Patient';
    $('#patient-name-display').html(safeFullName);
    $('#gender').html(toSentenceCase(gender) || '-');
    $('#birthdate').html(birthdate || '-');
    
    // SSN (from identifiers, if available)
    var ssn = extractSSNFromPatient(patient);
    $('#ssn').html(ssn);
    
    // Derive name parts
    var firstName = '-';
    var middleName = '-';
    var lastName = '-';
    
    if (patient && patient.name && patient.name[0]) {
      var givenArr = Array.isArray(patient.name[0].given) ? patient.name[0].given : (patient.name[0].given ? [patient.name[0].given] : []);
      var familyVal = Array.isArray(patient.name[0].family) ? patient.name[0].family.join(' ') : (patient.name[0].family || '');
      
      if (givenArr.length > 0) {
        firstName = givenArr[0];
      }
      if (givenArr.length > 1) {
        middleName = givenArr.slice(1).join(' ');
      }
      lastName = familyVal || '-';
    } else {
      // Fallback: split the full name if patient object not available
      var parts = safeFullName.split(' ');
      if (parts.length > 0) {
        firstName = parts[0];
      }
      if (parts.length > 2) {
        middleName = parts.slice(1, parts.length - 1).join(' ');
      }
      if (parts.length > 1) {
        lastName = parts[parts.length - 1];
      }
    }
    
    $('#fname').html(firstName || '-');
    $('#mname').html(middleName || '-');
    $('#lname').html(lastName || '-');
    
    // EHR Patient ID
    var ehrId = patient && patient.id ? patient.id : '-';
    $('#ehr-patient-id').html(ehrId);
    
    // Patient status (active/inactive)
    var statusText = '-';
    if (typeof patient?.active === 'boolean') {
      statusText = patient.active ? 'Active' : 'Inactive';
    }
    $('#patient-status').html(statusText);
    
    // Address fields
    var address1 = '-';
    var address2 = '-';
    var city = '-';
    var state = '-';
    var zip = '-';
    
    if (patient && patient.address && patient.address[0]) {
      var addr = patient.address[0];
      if (addr.line && addr.line.length > 0) {
        address1 = addr.line[0] || '-';
        if (addr.line.length > 1) {
          address2 = addr.line[1] || '-';
        }
      }
      city = addr.city || '-';
      state = addr.state || '-';
      zip = addr.postalCode || '-';
    }
    
    $('#address1').html(address1);
    $('#address2').html(address2);
    $('#city').html(city);
    $('#state').html(state);
    $('#zip').html(zip);
    
    // Contact: telephone and email
    var telephone = '-';
    var email = '-';
    if (patient && patient.telecom && patient.telecom.length > 0) {
      patient.telecom.forEach(function(t) {
        if (t.system === 'phone' && telephone === '-' && t.value) {
          telephone = t.value;
        } else if (t.system === 'email' && email === '-' && t.value) {
          email = t.value;
        }
      });
    }
    $('#telephone').html(telephone);
    $('#email').html(email);
    
    // Default summary values; updated later when other resources load
    $('#patient-allergies').html($('#patient-allergies').html() || '-');
    $('#patient-conditions').html($('#patient-conditions').html() || '-');
    $('#medications-supplements').html($('#medications-supplements').html() || '-');
    
    // Custom preferences from extensions (best-effort)
    var prefersChildSafetyCap = '-';
    var smsOptin = '-';
    if (patient && Array.isArray(patient.extension)) {
      patient.extension.forEach(function(ext) {
        if (!ext || !ext.url) return;
        var urlLower = String(ext.url).toLowerCase();
        if (urlLower.indexOf('child') !== -1 && urlLower.indexOf('safety') !== -1) {
          // Try boolean or string value
          if (typeof ext.valueBoolean === 'boolean') {
            prefersChildSafetyCap = ext.valueBoolean ? 'Yes' : 'No';
          } else if (ext.valueString) {
            prefersChildSafetyCap = ext.valueString;
          }
        } else if (urlLower.indexOf('sms') !== -1 || urlLower.indexOf('text-message') !== -1) {
          if (typeof ext.valueBoolean === 'boolean') {
            smsOptin = ext.valueBoolean ? 'Yes' : 'No';
          } else if (ext.valueString) {
            smsOptin = ext.valueString;
          }
        }
      });
    }
    $('#prefers-child-safety-cap').html(prefersChildSafetyCap);
    $('#sms-optin').html(smsOptin);
  }

  // Helper to extract SSN from Patient.identifier using common patterns
  function extractSSNFromPatient(patient) {
    if (!patient || !Array.isArray(patient.identifier)) {
      return '-';
    }
    
    var ssnValue = '-';
    
    patient.identifier.forEach(function(id) {
      if (!id) return;
      
      var system = (id.system || '').toLowerCase();
      var value = id.value || '';
      var typeCode = null;
      var typeDisplay = null;
      
      if (id.type && Array.isArray(id.type.coding) && id.type.coding.length > 0) {
        typeCode = (id.type.coding[0].code || '').toLowerCase();
        typeDisplay = (id.type.coding[0].display || '').toLowerCase();
      }
      
      var looksLikeSSNSystem =
        system.indexOf('us-ssn') !== -1 ||
        system.indexOf('ssn') !== -1;
      
      var looksLikeSSNType =
        typeCode === 'ss' ||
        (typeDisplay && typeDisplay.indexOf('ssn') !== -1);
      
      if ((looksLikeSSNSystem || looksLikeSSNType) && value) {
        ssnValue = value;
      }
    });
    
    return ssnValue || '-';
  }

  // Helper to safely set a text field on the prescription card
  function setPrescriptionField(id, value) {
    $('#' + id).html((value !== null && value !== undefined && value !== '') ? value : '-');
  }

  // Public helper to display prescription details in the Prescription card.
  // Expects an object with the following (matching your list):
  // cancelledAt, createdDate, daysSupply, dispenseAsWrittenCode, expiryDate,
  // FH_PatientID, FW_PatientID, initialFillDate, initialFillDaysSupply,
  // initialFillQuantity, instructions, lastFillDate, medicationBrandName,
  // medicationForm, medicationName, medicationStrength, ndc, numberOfFills,
  // prescriberAddressLine1, prescriberAddressLine2, prescriberCity,
  // prescriberName, prescriberRegistrationBody, prescriberRegistrationNumber,
  // prescriberState, prescriberTelephone, prescriberZip, quantityPerFill,
  // rxId, schedule
  // Function to extract prescription data from MedicationRequest and populate card
  function populatePrescriptionCard(medicationRequest, smartClient, patientId, buildUrlFn, makeRequestFn, wrapWithProxyFn) {
    console.log('populatePrescriptionCard called with:', medicationRequest);
    if (!medicationRequest) {
      console.warn('No medication request provided');
      window.displayPrescriptionCard(null);
      return;
    }
    
    var prescription = {};
    
    // Basic prescription info from MedicationRequest
    prescription.rxId = medicationRequest.id || '-';
    prescription.createdDate = medicationRequest.authoredOn ? new Date(medicationRequest.authoredOn).toLocaleDateString() : '-';
    prescription.cancelledAt = (medicationRequest.status === 'cancelled' && medicationRequest.meta && medicationRequest.meta.lastUpdated) 
      ? new Date(medicationRequest.meta.lastUpdated).toLocaleDateString() : '-';
    prescription.schedule = medicationRequest.status || '-';
    
    console.log('Extracted basic prescription data:', prescription);
    
    // Dispense information
    if (medicationRequest.dispenseRequest) {
      prescription.daysSupply = medicationRequest.dispenseRequest.expectedSupplyDuration ? 
        medicationRequest.dispenseRequest.expectedSupplyDuration.value + ' ' + 
        (medicationRequest.dispenseRequest.expectedSupplyDuration.unit || 'days') : '-';
      prescription.numberOfFills = medicationRequest.dispenseRequest.numberOfRepeatsAllowed || '-';
      prescription.quantityPerFill = medicationRequest.dispenseRequest.quantity ? 
        medicationRequest.dispenseRequest.quantity.value + ' ' + 
        (medicationRequest.dispenseRequest.quantity.unit || '') : '-';
    } else {
      prescription.daysSupply = '-';
      prescription.numberOfFills = '-';
      prescription.quantityPerFill = '-';
    }
    
    // Dispense as written (substitution)
    if (medicationRequest.substitution && medicationRequest.substitution.allowed) {
      prescription.dispenseAsWrittenCode = medicationRequest.substitution.allowed === false ? 'DAW' : '-';
    } else {
      prescription.dispenseAsWrittenCode = '-';
    }
    
    // Initial fill dates (from MedicationDispense if available, otherwise use authoredOn)
    prescription.initialFillDate = medicationRequest.authoredOn ? new Date(medicationRequest.authoredOn).toLocaleDateString() : '-';
    prescription.initialFillQuantity = prescription.quantityPerFill;
    prescription.initialFillDaysSupply = prescription.daysSupply;
    
    // Last fill date and expiry (would need MedicationDispense resources)
    prescription.lastFillDate = '-';
    prescription.expiryDate = '-';
    
    // Patient IDs
    prescription.FH_PatientID = patientId || '-';
    prescription.FW_PatientID = patientId || '-';
    
    // Medication information
    var medicationName = '-';
    var medicationBrandName = '-';
    var medicationStrength = '-';
    var medicationForm = '-';
    var ndc = '-';
    
    // Function to parse medication name text to extract strength and form
    function parseMedicationName(medName) {
      if (!medName || medName === '-') return;
      
      console.log('Parsing medication name for strength and form:', medName);
      
      // Common medication forms to look for (case insensitive)
      var forms = ['Injection', 'Tablet', 'Capsule', 'Solution', 'Suspension', 'Cream', 'Ointment', 
                   'Gel', 'Lotion', 'Spray', 'Drops', 'Patch', 'Film', 'Powder', 'Syrup', 'Elixir',
                   'Inj', 'Tab', 'Cap', 'Susp'];
      
      // Try to extract form (usually at the end, case insensitive)
      var medNameUpper = medName.toUpperCase();
      forms.forEach(function(form) {
        var formUpper = form.toUpperCase();
        if (medNameUpper.includes(formUpper) && medicationForm === '-') {
          // Find the actual case from the original string
          var formIndex = medNameUpper.indexOf(formUpper);
          if (formIndex >= 0) {
            // Check if it's at the end or followed by space/end of string
            var afterForm = medNameUpper.substring(formIndex + formUpper.length);
            if (afterForm.trim() === '' || afterForm.match(/^\s/)) {
              medicationForm = medName.substring(formIndex, formIndex + form.length);
              console.log('Extracted form:', medicationForm);
            }
          }
        }
      });
      
      // Try to extract strength (look for patterns like "X MG/ML", "X MG", "X%", etc.)
      // Pattern: number followed by unit (MG, ML, G, etc.) optionally with "/" and another unit
      // Prefer patterns with "/" (ratio) as they're more likely to be strength
      var strengthPatterns = [
        // Ratio patterns (e.g., "5 MG/ML", "10 MG/1 ML")
        /(\d+(?:\.\d+)?\s*(?:MG|ML|G|MCG|IU|UNITS?)\s*\/\s*\d*(?:\.\d+)?\s*(?:ML|G|MG|MCG|IU)?)/gi,
        // Percentage
        /(\d+(?:\.\d+)?\s*%)/gi,
        // Simple strength with MG (e.g., "5 MG")
        /(\d+(?:\.\d+)?\s*MG\b)/gi
      ];
      
      var foundStrength = false;
      strengthPatterns.forEach(function(pattern) {
        if (foundStrength) return;
        
        var matches = medName.match(pattern);
        if (matches && matches.length > 0) {
          // Filter out volume measurements (like "10 ML" at the start)
          var strengthMatch = matches.find(function(m) {
            var trimmed = m.trim();
            // Prefer ratios or percentages
            if (trimmed.includes('/') || trimmed.includes('%')) {
              return true;
            }
            // Prefer MG over ML for strength
            if (trimmed.toUpperCase().includes('MG')) {
              return true;
            }
            return false;
          });
          
          if (strengthMatch) {
            medicationStrength = strengthMatch.trim();
            foundStrength = true;
            console.log('Extracted strength:', medicationStrength);
          }
        }
      });
    }
    
    // Function to extract strength and form from Medication resource
    function extractMedicationDetails(medicationResource) {
      if (!medicationResource) return;
      
      // Extract form from Medication.doseForm
      if (medicationResource.form) {
        if (medicationResource.form.coding && medicationResource.form.coding[0]) {
          medicationForm = medicationResource.form.coding[0].display || 
                          medicationResource.form.coding[0].code || '-';
        } else if (medicationResource.form.text) {
          medicationForm = medicationResource.form.text;
        }
      }
      
      // Extract strength from Medication.ingredient[].strength
      if (medicationResource.ingredient && medicationResource.ingredient.length > 0) {
        medicationResource.ingredient.forEach(function(ingredient) {
          if (ingredient.strength) {
            var strengthParts = [];
            
            // Handle strength as Ratio
            if (ingredient.strength.numerator && ingredient.strength.denominator) {
              var numValue = ingredient.strength.numerator.value || '';
              var numUnit = ingredient.strength.numerator.unit || '';
              var denValue = ingredient.strength.denominator.value || '';
              var denUnit = ingredient.strength.denominator.unit || '';
              
              if (numValue && numUnit) {
                strengthParts.push(numValue + ' ' + numUnit);
              }
              if (denValue && denUnit) {
                strengthParts.push('per ' + denValue + ' ' + denUnit);
              }
            } 
            // Handle strength as Quantity
            else if (ingredient.strength.value !== undefined) {
              var value = ingredient.strength.value || '';
              var unit = ingredient.strength.unit || '';
              if (value) {
                strengthParts.push(value + (unit ? ' ' + unit : ''));
              }
            }
            
            if (strengthParts.length > 0) {
              medicationStrength = strengthParts.join(' ');
            }
          }
        });
      }
      
      // Extract NDC from Medication.code (if available)
      if (medicationResource.code && medicationResource.code.coding) {
        medicationResource.code.coding.forEach(function(coding) {
          if (coding.system === 'http://hl7.org/fhir/sid/ndc' || 
              coding.system === 'urn:oid:2.16.840.1.113883.6.69') {
            ndc = coding.code || '-';
          }
        });
      }
    }
    
    if (medicationRequest.medicationCodeableConcept) {
      if (medicationRequest.medicationCodeableConcept.text) {
        medicationName = medicationRequest.medicationCodeableConcept.text;
        // Try to parse strength and form from the text
        parseMedicationName(medicationName);
      } else if (medicationRequest.medicationCodeableConcept.coding && medicationRequest.medicationCodeableConcept.coding[0]) {
        medicationName = medicationRequest.medicationCodeableConcept.coding[0].display || 
                         medicationRequest.medicationCodeableConcept.coding[0].code;
        // Try to parse strength and form from the display name
        if (medicationRequest.medicationCodeableConcept.coding[0].display) {
          parseMedicationName(medicationRequest.medicationCodeableConcept.coding[0].display);
        }
      }
      
      // Try to extract strength and form from coding
      if (medicationRequest.medicationCodeableConcept.coding) {
        medicationRequest.medicationCodeableConcept.coding.forEach(function(coding) {
          if (coding.system === 'http://www.nlm.nih.gov/research/umls/rxnorm') {
            medicationBrandName = coding.display || medicationBrandName;
            // Also try to parse from brand name
            if (coding.display && medicationStrength === '-') {
              parseMedicationName(coding.display);
            }
          }
        });
      }
    } else if (medicationRequest.medicationReference) {
      // Medication is referenced - fetch the Medication resource
      if (medicationRequest.medicationReference.display) {
        medicationName = medicationRequest.medicationReference.display;
        // Try to parse strength and form from display name first
        parseMedicationName(medicationName);
      }
      
      // Extract Medication ID from reference
      var medicationRef = medicationRequest.medicationReference.reference || '';
      var medicationId = medicationRef.split('/').pop();
      
      if (medicationId && makeRequestFn && wrapWithProxyFn) {
        console.log('Fetching Medication resource:', medicationId);
        var medicationUrl = smartClient.state.serverUrl + '/Medication/' + medicationId;
        medicationUrl = wrapWithProxyFn(medicationUrl);
        
        makeRequestFn(medicationUrl, 'Medication').then(function(response) {
          var medicationResource = null;
          if (response && response.resourceType === 'Medication') {
            medicationResource = response;
          } else if (response && response.entry && response.entry[0]) {
            medicationResource = response.entry[0].resource;
          }
          
          if (medicationResource) {
            console.log('Medication resource fetched:', medicationResource);
            extractMedicationDetails(medicationResource);
            
            // Update prescription with extracted details
            prescription.medicationStrength = medicationStrength;
            prescription.medicationForm = medicationForm;
            prescription.ndc = ndc;
            
            // Update the card
            window.displayPrescriptionCard(prescription);
          }
        }).catch(function(error) {
          console.warn('Failed to fetch Medication resource:', error);
          // Continue with what we have (parsed from name)
        });
      }
    }
    
    // Extract strength and form from dosage instructions as fallback
    if (medicationRequest.dosageInstruction && medicationRequest.dosageInstruction[0]) {
      var dosage = medicationRequest.dosageInstruction[0];
      if (dosage.text) {
        prescription.instructions = dosage.text;
      }
      // Only use dosage strength if we don't have medication strength
      if (medicationStrength === '-' && dosage.doseAndRate && dosage.doseAndRate[0] && dosage.doseAndRate[0].doseQuantity) {
        var dose = dosage.doseAndRate[0].doseQuantity;
        medicationStrength = (dose.value || '') + ' ' + (dose.unit || '');
      }
    }
    
    prescription.medicationName = medicationName;
    prescription.medicationBrandName = medicationBrandName;
    prescription.medicationStrength = medicationStrength;
    prescription.medicationForm = medicationForm;
    prescription.ndc = ndc;
    prescription.instructions = prescription.instructions || '-';
    
    // Prescriber information - need to fetch Practitioner resource
    prescription.prescriberName = '-';
    prescription.prescriberRegistrationBody = '-';
    prescription.prescriberRegistrationNumber = '-';
    prescription.prescriberTelephone = '-';
    prescription.prescriberAddressLine1 = '-';
    prescription.prescriberAddressLine2 = '-';
    prescription.prescriberCity = '-';
    prescription.prescriberState = '-';
    prescription.prescriberZip = '-';
    
    // First, display the prescription card with what we have so far
    console.log('Displaying prescription card with initial data');
    window.displayPrescriptionCard(prescription);
    
    // Fetch prescriber if reference exists (async, will update card later)
    if (medicationRequest.requester && medicationRequest.requester.reference && makeRequestFn && wrapWithProxyFn) {
      var prescriberRef = medicationRequest.requester.reference;
      var prescriberId = prescriberRef.split('/').pop();
      var prescriberType = prescriberRef.includes('Practitioner') ? 'Practitioner' : 
                          prescriberRef.includes('Organization') ? 'Organization' : null;
      
      if (prescriberType && prescriberId) {
        console.log('Fetching prescriber:', prescriberType, prescriberId);
        // Build URL for prescriber resource
        var prescriberUrl = smartClient.state.serverUrl + '/' + prescriberType + '/' + prescriberId;
        prescriberUrl = wrapWithProxyFn(prescriberUrl);
        makeRequestFn(prescriberUrl, 'Prescriber').then(function(response) {
          var prescriber = null;
          // Handle both Bundle and direct resource responses
          if (response && response.entry && response.entry[0]) {
            prescriber = response.entry[0].resource;
          } else if (response && response.resourceType === prescriberType) {
            prescriber = response;
          } else if (response && response.resourceType === 'Bundle' && response.entry && response.entry[0]) {
            prescriber = response.entry[0].resource;
          }
          
          if (prescriber) {
            // Extract prescriber name
            if (prescriber.name) {
              if (Array.isArray(prescriber.name)) {
                var name = prescriber.name[0];
                prescription.prescriberName = (name.given ? name.given.join(' ') : '') + 
                                            (name.family ? ' ' + name.family : '');
              } else {
                prescription.prescriberName = prescriber.name.text || '-';
              }
            }
            
            // Extract registration info
            if (prescriber.qualification && prescriber.qualification[0]) {
              var qual = prescriber.qualification[0];
              if (qual.issuer && qual.issuer.display) {
                prescription.prescriberRegistrationBody = qual.issuer.display;
              }
              if (qual.identifier && qual.identifier.value) {
                prescription.prescriberRegistrationNumber = qual.identifier.value;
              }
            }
            
            // Extract contact info
            if (prescriber.telecom) {
              prescriber.telecom.forEach(function(contact) {
                if (contact.system === 'phone') {
                  prescription.prescriberTelephone = contact.value || '-';
                }
              });
            }
            
            // Extract address
            if (prescriber.address && prescriber.address[0]) {
              var addr = prescriber.address[0];
              prescription.prescriberAddressLine1 = (addr.line && addr.line[0]) || '-';
              prescription.prescriberAddressLine2 = (addr.line && addr.line[1]) || '-';
              prescription.prescriberCity = addr.city || '-';
              prescription.prescriberState = addr.state || '-';
              prescription.prescriberZip = addr.postalCode || '-';
            }
            
            // Update the card with prescriber info
            console.log('Updating prescription card with prescriber info');
            window.displayPrescriptionCard(prescription);
          } else {
            console.warn('No prescriber data found in response');
            // Prescription already displayed, no need to update
          }
        }).catch(function(error) {
          console.warn('Failed to fetch prescriber:', error);
          // Prescription already displayed, no need to update
        });
      } else {
        console.log('No valid prescriber type/ID found');
        // Prescription already displayed
      }
    } else {
      console.log('No prescriber reference or helper functions available');
      // Prescription already displayed
    }
  }
  
  window.displayPrescriptionCard = function(prescription) {
    console.log('displayPrescriptionCard called with:', prescription);
    if (!prescription) {
      console.log('Clearing prescription card');
      // Clear all fields if no prescription is provided
      [
        'rxId', 'createdDate', 'cancelledAt', 'schedule', 'daysSupply',
        'numberOfFills', 'quantityPerFill', 'dispenseAsWrittenCode',
        'initialFillDate', 'initialFillQuantity', 'initialFillDaysSupply',
        'lastFillDate', 'expiryDate', 'FH_PatientID', 'FW_PatientID',
        'medicationName', 'medicationBrandName', 'medicationStrength',
        'medicationForm', 'ndc', 'instructions', 'prescriberName',
        'prescriberRegistrationBody', 'prescriberRegistrationNumber',
        'prescriberTelephone', 'prescriberAddressLine1',
        'prescriberAddressLine2', 'prescriberCity', 'prescriberState',
        'prescriberZip'
      ].forEach(function(id) {
        var $el = $('#' + id);
        if ($el.length === 0) {
          console.warn('Prescription field element not found:', id);
        } else {
          setPrescriptionField(id, '-');
        }
      });
      return;
    }

    console.log('Setting prescription fields');
    // Basic prescription and medication info
    setPrescriptionField('rxId', prescription.rxId);
    setPrescriptionField('createdDate', prescription.createdDate);
    setPrescriptionField('cancelledAt', prescription.cancelledAt);
    setPrescriptionField('schedule', prescription.schedule);
    setPrescriptionField('daysSupply', prescription.daysSupply);
    setPrescriptionField('numberOfFills', prescription.numberOfFills);
    setPrescriptionField('quantityPerFill', prescription.quantityPerFill);
    setPrescriptionField('dispenseAsWrittenCode', prescription.dispenseAsWrittenCode);
    setPrescriptionField('initialFillDate', prescription.initialFillDate);
    setPrescriptionField('initialFillQuantity', prescription.initialFillQuantity);
    setPrescriptionField('initialFillDaysSupply', prescription.initialFillDaysSupply);
    setPrescriptionField('lastFillDate', prescription.lastFillDate);
    setPrescriptionField('expiryDate', prescription.expiryDate);
    setPrescriptionField('FH_PatientID', prescription.FH_PatientID);
    setPrescriptionField('FW_PatientID', prescription.FW_PatientID);

    setPrescriptionField('medicationName', prescription.medicationName);
    setPrescriptionField('medicationBrandName', prescription.medicationBrandName);
    setPrescriptionField('medicationStrength', prescription.medicationStrength);
    setPrescriptionField('medicationForm', prescription.medicationForm);
    setPrescriptionField('ndc', prescription.ndc);
    setPrescriptionField('instructions', prescription.instructions);

    // Prescriber details
    setPrescriptionField('prescriberName', prescription.prescriberName);
    setPrescriptionField('prescriberRegistrationBody', prescription.prescriberRegistrationBody);
    setPrescriptionField('prescriberRegistrationNumber', prescription.prescriberRegistrationNumber);
    setPrescriptionField('prescriberTelephone', prescription.prescriberTelephone);

    setPrescriptionField('prescriberAddressLine1', prescription.prescriberAddressLine1);
    setPrescriptionField('prescriberAddressLine2', prescription.prescriberAddressLine2);
    setPrescriptionField('prescriberCity', prescription.prescriberCity);
    setPrescriptionField('prescriberState', prescription.prescriberState);
    setPrescriptionField('prescriberZip', prescription.prescriberZip);
  };
  
  // Helper function to populate encounter filter dropdown from medications
  function populateEncounterFilter(medications) {
    var encounterMap = {};
    
    medications.forEach(function(med) {
      var encounterId = null;
      if (med.encounter && med.encounter.reference) {
        var parts = med.encounter.reference.split('/');
        if (parts.length > 1) {
          encounterId = parts[parts.length - 1];
        }
      } else if (med.context && med.context.reference) {
        // R2 might use context
        var parts = med.context.reference.split('/');
        if (parts.length > 1) {
          encounterId = parts[parts.length - 1];
        }
      }
      
      if (encounterId) {
        encounterMap[encounterId] = true;
      }
    });
    
    var $filter = $('#medication-filter-encounter');
    $filter.empty();
    $filter.append('<option value="">All Medications</option>');
    
    // Sort encounter IDs
    var encounterIds = Object.keys(encounterMap).sort();
    encounterIds.forEach(function(encounterId) {
      $filter.append('<option value="' + encounterId + '">Encounter: ' + encounterId + '</option>');
    });
    
    if (encounterIds.length === 0) {
      $filter.append('<option value="">No encounters found</option>');
    }
  }

  // Helper function to format medication details in a readable way
  // Make it globally accessible for use in HTML
  window.formatMedicationDetails = function formatMedicationDetails(med) {
    if (!med) return '<p>No medication data available</p>';
    
    var html = '<div style="display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; font-size: 0.9em;">';
    
    // Helper to format a field
    function addField(label, value, isMultiline) {
      if (value === null || value === undefined || value === '') {
        value = '<span style="color: #999; font-style: italic;">-</span>';
      }
      var valueStyle = isMultiline ? 'grid-column: 2; white-space: pre-wrap; word-break: break-word;' : 'grid-column: 2;';
      html += '<div style="font-weight: 600; color: #495057;">' + label + ':</div>';
      html += '<div style="' + valueStyle + ' color: #212529;">' + value + '</div>';
    }
    
    // Basic Information
    html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 8px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Basic Information</div>';
    addField('Resource ID', med.id);
    addField('Resource Type', med.resourceType);
    addField('Status', med.status);
    if (med.intent) addField('Intent', med.intent);
    if (med.priority) addField('Priority', med.priority);
    if (med.authoredOn) addField('Authored On', new Date(med.authoredOn).toLocaleString());
    if (med.validityPeriod) {
      if (med.validityPeriod.start) addField('Valid From', new Date(med.validityPeriod.start).toLocaleString());
      if (med.validityPeriod.end) addField('Valid Until', new Date(med.validityPeriod.end).toLocaleString());
    }
    
    // Medication Information
    html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Medication Information</div>';
    if (med.medicationCodeableConcept) {
      if (med.medicationCodeableConcept.text) addField('Medication Name', med.medicationCodeableConcept.text);
      if (med.medicationCodeableConcept.coding && med.medicationCodeableConcept.coding.length > 0) {
        var codings = med.medicationCodeableConcept.coding.map(function(c) {
          return (c.display || c.code) + (c.system ? ' (' + c.system + ')' : '');
        }).join('<br>');
        addField('Coding', codings, true);
      }
    }
    if (med.medicationReference) {
      addField('Medication Reference', med.medicationReference.reference || med.medicationReference.display);
    }
    
    // Dosage Instructions
    if (med.dosageInstruction && med.dosageInstruction.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Dosage Instructions</div>';
      med.dosageInstruction.forEach(function(dosage, idx) {
        if (idx > 0) html += '<div style="grid-column: 1 / -1; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #dee2e6;"></div>';
        if (dosage.text) addField('Instructions', dosage.text, true);
        if (dosage.route && dosage.route.coding && dosage.route.coding[0]) {
          addField('Route', (dosage.route.coding[0].display || dosage.route.coding[0].code) + (dosage.route.coding[0].system ? ' (' + dosage.route.coding[0].system + ')' : ''));
        }
        if (dosage.doseAndRate && dosage.doseAndRate[0]) {
          var dose = dosage.doseAndRate[0];
          if (dose.doseQuantity) {
            addField('Dose', (dose.doseQuantity.value || '') + ' ' + (dose.doseQuantity.unit || ''));
          }
          if (dose.rateQuantity) {
            addField('Rate', (dose.rateQuantity.value || '') + ' ' + (dose.rateQuantity.unit || ''));
          }
        }
        if (dosage.timing) {
          if (dosage.timing.repeat) {
            var timing = '';
            if (dosage.timing.repeat.frequency) timing += dosage.timing.repeat.frequency + 'x';
            if (dosage.timing.repeat.period) timing += ' every ' + dosage.timing.repeat.period + ' ' + (dosage.timing.repeat.periodUnit || '');
            if (timing) addField('Frequency', timing);
          }
          if (dosage.timing.code && dosage.timing.code.text) {
            addField('Schedule', dosage.timing.code.text);
          }
        }
      });
    }
    
    // Dispense Request
    if (med.dispenseRequest) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Dispense Information</div>';
      if (med.dispenseRequest.quantity) {
        addField('Quantity', (med.dispenseRequest.quantity.value || '') + ' ' + (med.dispenseRequest.quantity.unit || ''));
      }
      if (med.dispenseRequest.expectedSupplyDuration) {
        addField('Days Supply', (med.dispenseRequest.expectedSupplyDuration.value || '') + ' ' + (med.dispenseRequest.expectedSupplyDuration.unit || 'days'));
      }
      if (med.dispenseRequest.numberOfRepeatsAllowed !== undefined) {
        addField('Number of Refills', med.dispenseRequest.numberOfRepeatsAllowed);
      }
      if (med.dispenseRequest.validityPeriod) {
        if (med.dispenseRequest.validityPeriod.start) addField('Valid From', new Date(med.dispenseRequest.validityPeriod.start).toLocaleString());
        if (med.dispenseRequest.validityPeriod.end) addField('Valid Until', new Date(med.dispenseRequest.validityPeriod.end).toLocaleString());
      }
    }
    
    // Substitution
    if (med.substitution) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Substitution</div>';
      addField('Allowed', med.substitution.allowed === false ? 'No (Dispense As Written)' : (med.substitution.allowed ? 'Yes' : 'Unknown'));
      if (med.substitution.reason && med.substitution.reason.coding && med.substitution.reason.coding[0]) {
        addField('Reason', med.substitution.reason.coding[0].display || med.substitution.reason.coding[0].code);
      }
    }
    
    // Encounter/Context
    if (med.encounter || med.context) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Encounter</div>';
      if (med.encounter && med.encounter.reference) addField('Encounter Reference', med.encounter.reference);
      if (med.context && med.context.reference) addField('Context Reference', med.context.reference);
    }
    
    // Requester/Prescriber
    if (med.requester) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Prescriber</div>';
      if (med.requester.reference) addField('Requester Reference', med.requester.reference);
      if (med.requester.display) addField('Requester Name', med.requester.display);
    }
    
    // Notes
    if (med.note && med.note.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Notes</div>';
      med.note.forEach(function(note, idx) {
        if (idx > 0) html += '<div style="grid-column: 1 / -1; margin-top: 8px;"></div>';
        if (note.text) addField('Note ' + (idx + 1), note.text, true);
        if (note.authorString) addField('Author', note.authorString);
        if (note.time) addField('Time', new Date(note.time).toLocaleString());
      });
    }
    
    // Identifiers
    if (med.identifier && med.identifier.length > 0) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Identifiers</div>';
      med.identifier.forEach(function(id) {
        var idValue = (id.value || '') + (id.system ? ' (' + id.system + ')' : '');
        addField(id.type ? id.type.text || id.type.coding[0].display : 'Identifier', idValue);
      });
    }
    
    // Meta Information
    if (med.meta) {
      html += '<div style="grid-column: 1 / -1; font-weight: 700; color: #007bff; margin-top: 12px; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #dee2e6;">Meta Information</div>';
      if (med.meta.lastUpdated) addField('Last Updated', new Date(med.meta.lastUpdated).toLocaleString());
      if (med.meta.versionId) addField('Version', med.meta.versionId);
      if (med.meta.profile && med.meta.profile.length > 0) {
        addField('Profile', med.meta.profile.join('<br>'), true);
      }
    }
    
    html += '</div>';
    return html;
  };
  
  // Make displayMedications globally accessible
  window.displayMedications = function(medications, filterEncounterId) {
    console.log('displayMedications called with', medications.length, 'items');
    
    // Filter by encounter if specified
    if (filterEncounterId && filterEncounterId.trim() !== '') {
      medications = medications.filter(function(med) {
        var medEncounterId = null;
        if (med.encounter && med.encounter.reference) {
          var parts = med.encounter.reference.split('/');
          if (parts.length > 1) {
            medEncounterId = parts[parts.length - 1];
          }
        } else if (med.context && med.context.reference) {
          var parts = med.context.reference.split('/');
          if (parts.length > 1) {
            medEncounterId = parts[parts.length - 1];
          }
        }
        return medEncounterId === filterEncounterId;
      });
      console.log('Filtered to', medications.length, 'medications for encounter', filterEncounterId);
    }
    
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
        
        // Extract encounter reference if present
        var encounterRef = '';
        var encounterId = null;
        if (med.encounter && med.encounter.reference) {
          encounterRef = med.encounter.reference;
          // Extract just the ID part
          var parts = encounterRef.split('/');
          if (parts.length > 1) {
            encounterId = parts[parts.length - 1];
            encounterRef = 'Encounter: ' + encounterId;
          }
        } else if (med.context && med.context.reference) {
          // R2 might use context instead of encounter
          encounterRef = med.context.reference;
          var parts = encounterRef.split('/');
          if (parts.length > 1) {
            encounterId = parts[parts.length - 1];
            encounterRef = 'Encounter: ' + encounterId;
          }
        }
        
        // Extract notes if present (Annotation structure)
        var notes = '';
        if (med.note && med.note.length > 0) {
          notes = med.note.map(function(note) {
            var noteText = note.text || '';
            var noteAuthor = note.authorString ? ' (' + note.authorString + ')' : '';
            var noteTime = note.time ? ' [' + new Date(note.time).toLocaleString() + ']' : '';
            return noteText + noteAuthor + noteTime;
          }).filter(function(text) {
            return text.length > 0;
          }).join('; ');
        }
        
        var meta = status;
        if (intent) meta += ' • ' + intent;
        if (priority) meta += ' • ' + priority;
        if (dosage) meta += ' • ' + dosage;
        if (authoredOn) meta += ' • Authored: ' + authoredOn;
        if (validFrom) meta += ' • Valid from: ' + validFrom;
        if (validUntil) meta += ' • Valid until: ' + validUntil;
        if (encounterRef) meta += ' • ' + encounterRef;
        if (notes) meta += ' • Note: ' + notes;
        
        // Add fulfill button for active medications
        var fulfillButton = '';
        var isFulfilled = med.status === 'completed' || med.status === 'fulfilled';
        
        if (isFulfilled) {
          fulfillButton = '<span style="margin-left: 10px; padding: 4px 12px; background: #6c757d; color: white; border-radius: 4px; font-size: 0.85em; display: inline-block;">' +
                         '<i class="fas fa-check-circle"></i> Fulfilled</span>';
        } else if (med.status && med.status !== 'cancelled' && med.status !== 'stopped' && med.status !== 'entered-in-error') {
          fulfillButton = '<button class="fulfill-med-btn" data-med-id="' + med.id + '" data-med-name="' + 
                         encodeURIComponent(medName) + '" style="margin-left: 10px; padding: 4px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.85em; white-space: nowrap;">' +
                         '<i class="fas fa-check"></i> Fulfill</button>';
        }
        
        // Build collapsible details content (formatted, readable view)
        var detailsHtml = formatMedicationDetails(med);
        
        var detailsId = 'med-details-' + med.id;
        
        html += '<li class="med-list-item" style="margin-bottom: 10px; border-radius: 4px; border: 1px solid #e0e0e0; padding: 8px 10px; background: #fff;">' +
                  '<div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" class="med-header" data-med-details-id="' + detailsId + '">' +
                    '<div style="flex: 1;">' +
                      '<strong>' + medName + '</strong>' +
                      '<div class="item-meta" style="margin-top: 4px;">' + meta + '</div>' +
                    '</div>' +
                    '<div style="display: flex; align-items: center; gap: 8px; margin-left: 8px;">' +
                      '<button type="button" class="med-details-toggle" data-med-details-id="' + detailsId + '" style="padding: 3px 8px; font-size: 0.8em; border-radius: 4px; border: 1px solid #ced4da; background: #f8f9fa; cursor: pointer;">' +
                        '<span class="med-details-toggle-text">Details</span>' +
                      '</button>' +
                      fulfillButton +
                    '</div>' +
                  '</div>' +
                  '<div id="' + detailsId + '" class="med-details" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e0e0e0; font-size: 0.85em; max-height: 400px; overflow: auto; background: #f8f9fa; border-radius: 4px; padding: 12px;">' +
                    detailsHtml +
                  '</div>' +
                '</li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No medications available</span></div>';
    }
    $('#medications').html(html);
    
    // Update patient card summary for medications / supplements
    try {
      var medSummary = '-';
      if (Array.isArray(medications) && medications.length > 0) {
        medSummary = medications.length + ' medication' + (medications.length > 1 ? 's' : '');
      }
      $('#medications-supplements').html(medSummary);
    } catch (e) {
      console.warn('Unable to update medications summary on patient card:', e);
    }
  };
  
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
    
    // Update patient card summary for allergies
    try {
      var allergySummary = '-';
      if (Array.isArray(allergies) && allergies.length > 0) {
        allergySummary = allergies.length + ' allerg' + (allergies.length > 1 ? 'ies' : 'y');
      } else {
        allergySummary = 'None recorded';
      }
      $('#patient-allergies').html(allergySummary);
    } catch (e) {
      console.warn('Unable to update allergies summary on patient card:', e);
    }
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
    
    // Update patient card summary for conditions
    try {
      var conditionSummary = '-';
      if (Array.isArray(conditions) && conditions.length > 0) {
        conditionSummary = conditions.length + ' condition' + (conditions.length > 1 ? 's' : '');
      } else {
        conditionSummary = 'None recorded';
      }
      $('#patient-conditions').html(conditionSummary);
    } catch (e) {
      console.warn('Unable to update conditions summary on patient card:', e);
    }
  }
  
  function displayConsents(consents, searchTerm) {
    var html = '';
    
    // Filter consents by search term if provided
    var filteredConsents = consents || [];
    if (searchTerm && searchTerm.trim() !== '') {
      var searchLower = searchTerm.toLowerCase().trim();
      filteredConsents = filteredConsents.filter(function(consent) {
        // Search in status
        var status = (consent.status || '').toLowerCase();
        // Search in category
        var categoryText = '';
        if (consent.category && consent.category.length > 0) {
          consent.category.forEach(function(cat) {
            if (cat.coding && cat.coding.length > 0) {
              cat.coding.forEach(function(coding) {
                if (coding.display) categoryText += ' ' + coding.display.toLowerCase();
                if (coding.code) categoryText += ' ' + coding.code.toLowerCase();
              });
            }
            if (cat.text) categoryText += ' ' + cat.text.toLowerCase();
          });
        }
        // Search in scope
        var scopeText = '';
        if (consent.scope && consent.scope.coding && consent.scope.coding.length > 0) {
          consent.scope.coding.forEach(function(coding) {
            if (coding.display) scopeText += ' ' + coding.display.toLowerCase();
            if (coding.code) scopeText += ' ' + coding.code.toLowerCase();
          });
        }
        // Search in source reference
        var sourceText = '';
        if (consent.sourceReference && consent.sourceReference.display) {
          sourceText = consent.sourceReference.display.toLowerCase();
        }
        // Search in policy text
        var policyText = '';
        if (consent.policy && consent.policy.length > 0) {
          consent.policy.forEach(function(pol) {
            if (pol.authority) policyText += ' ' + pol.authority.toLowerCase();
            if (pol.uri) policyText += ' ' + pol.uri.toLowerCase();
          });
        }
        // Search in provision text
        var provisionText = '';
        if (consent.provision && consent.provision.type) {
          provisionText = (consent.provision.type || '').toLowerCase();
        }
        
        return status.indexOf(searchLower) !== -1 ||
               categoryText.indexOf(searchLower) !== -1 ||
               scopeText.indexOf(searchLower) !== -1 ||
               sourceText.indexOf(searchLower) !== -1 ||
               policyText.indexOf(searchLower) !== -1 ||
               provisionText.indexOf(searchLower) !== -1;
      });
    }
    
    if (filteredConsents && filteredConsents.length > 0) {
      // Sort consents by date (most recent first)
      var sortedConsents = filteredConsents.sort(function(a, b) {
        var dateA = new Date((a.meta && a.meta.lastUpdated) || a.dateTime || 0);
        var dateB = new Date((b.meta && b.meta.lastUpdated) || b.dateTime || 0);
        return dateB - dateA; // Most recent first
      });
      
      var resultHeader = '';
      if (searchTerm && searchTerm.trim() !== '' && filteredConsents.length < consents.length) {
        resultHeader = '<div style="margin-bottom: 12px; padding: 8px; background: #e7f3ff; border-radius: 4px; font-size: 0.9em;">';
        resultHeader += '<strong>Showing ' + filteredConsents.length + ' of ' + consents.length + ' consent' + (consents.length !== 1 ? 's' : '') + '</strong>';
        resultHeader += '</div>';
      }
      
      html = resultHeader + '<ul style="list-style: none; padding: 0; margin: 0;">';
      sortedConsents.forEach(function(consent) {
        var consentId = consent.id || 'Unknown';
        
        // Extract status
        var status = formatStatus(consent.status) || 'Unknown';
        var statusClass = consent.status === 'active' ? 'success' : 
                         (consent.status === 'inactive' ? 'warning' : 
                         (consent.status === 'proposed' ? 'info' : 'secondary'));
        
        // Extract category
        var category = '-';
        if (consent.category && consent.category.length > 0) {
          var categories = [];
          consent.category.forEach(function(cat) {
            if (cat.coding && cat.coding.length > 0) {
              cat.coding.forEach(function(coding) {
                if (coding.display) {
                  categories.push(coding.display);
                } else if (coding.code) {
                  categories.push(coding.code);
                }
              });
            } else if (cat.text) {
              categories.push(cat.text);
            }
          });
          if (categories.length > 0) {
            category = categories.join(', ');
          }
        }
        
        // Extract scope
        var scope = '-';
        if (consent.scope && consent.scope.coding && consent.scope.coding.length > 0) {
          scope = consent.scope.coding[0].display || consent.scope.coding[0].code || '-';
        } else if (consent.scope && consent.scope.text) {
          scope = consent.scope.text;
        }
        
        // Extract date/time
        var dateTime = '-';
        if (consent.dateTime) {
          dateTime = new Date(consent.dateTime).toLocaleString();
        } else if (consent.meta && consent.meta.lastUpdated) {
          dateTime = new Date(consent.meta.lastUpdated).toLocaleString();
        }
        
        // Extract source
        var source = '-';
        if (consent.sourceReference && consent.sourceReference.display) {
          source = consent.sourceReference.display;
        } else if (consent.sourceReference && consent.sourceReference.reference) {
          source = consent.sourceReference.reference;
        } else if (consent.sourceAttachment && consent.sourceAttachment.title) {
          source = consent.sourceAttachment.title;
        }
        
        // Extract policy
        var policy = '-';
        if (consent.policy && consent.policy.length > 0) {
          var policies = [];
          consent.policy.forEach(function(pol) {
            if (pol.authority) {
              policies.push(pol.authority);
            } else if (pol.uri) {
              policies.push(pol.uri);
            }
          });
          if (policies.length > 0) {
            policy = policies.join(', ');
          }
        }
        
        // Extract provision type
        var provisionType = '-';
        if (consent.provision && consent.provision.type) {
          provisionType = formatStatus(consent.provision.type);
        }
        
        // Extract patient
        var patientRef = '-';
        if (consent.patient && consent.patient.reference) {
          patientRef = consent.patient.reference;
        } else if (consent.patient && consent.patient.display) {
          patientRef = consent.patient.display;
        }
        
        // Extract performer
        var performer = '-';
        if (consent.performer && consent.performer.length > 0) {
          var performers = [];
          consent.performer.forEach(function(perf) {
            if (perf.display) {
              performers.push(perf.display);
            } else if (perf.reference) {
              performers.push(perf.reference);
            }
          });
          if (performers.length > 0) {
            performer = performers.join(', ');
          }
        }
        
        var meta = status;
        if (category !== '-') meta += ' • Category: ' + category;
        if (scope !== '-') meta += ' • Scope: ' + scope;
        if (dateTime !== '-') meta += ' • Date: ' + dateTime;
        if (source !== '-') meta += ' • Source: ' + source;
        if (policy !== '-') meta += ' • Policy: ' + policy;
        if (provisionType !== '-') meta += ' • Provision: ' + provisionType;
        if (performer !== '-') meta += ' • Performer: ' + performer;
        
        html += '<li style="margin-bottom: 12px; border-radius: 4px; border: 1px solid #e0e0e0; padding: 12px; background: #fff;">';
        html += '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">';
        html += '<div style="flex: 1;">';
        html += '<div style="font-size: 1.1em; font-weight: 600; color: #007bff; margin-bottom: 4px;">';
        html += '<span class="badge badge-' + statusClass + '" style="padding: 2px 6px; border-radius: 3px; font-size: 0.8em; font-weight: 600; margin-right: 8px;">' + status + '</span>';
        html += scope !== '-' ? scope : 'Consent';
        html += '</div>';
        html += '<div style="font-size: 0.85em; color: #666; margin-top: 4px;">';
        html += '<span style="margin-right: 12px;"><strong>ID:</strong> ' + consentId + '</span>';
        if (patientRef !== '-') {
          html += '<span style="margin-right: 12px;"><strong>Patient:</strong> ' + patientRef + '</span>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
        
        // Details grid
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0; font-size: 0.9em;">';
        if (category !== '-') {
          html += '<div><strong style="color: #666;">Category:</strong> ' + category + '</div>';
        }
        if (scope !== '-') {
          html += '<div><strong style="color: #666;">Scope:</strong> ' + scope + '</div>';
        }
        if (dateTime !== '-') {
          html += '<div><strong style="color: #666;">Date/Time:</strong> ' + dateTime + '</div>';
        }
        if (source !== '-') {
          html += '<div><strong style="color: #666;">Source:</strong> ' + source + '</div>';
        }
        if (policy !== '-') {
          html += '<div><strong style="color: #666;">Policy:</strong> ' + policy + '</div>';
        }
        if (provisionType !== '-') {
          html += '<div><strong style="color: #666;">Provision Type:</strong> ' + provisionType + '</div>';
        }
        if (performer !== '-') {
          html += '<div><strong style="color: #666;">Performer:</strong> ' + performer + '</div>';
        }
        html += '</div>';
        
        html += '</li>';
      });
      html += '</ul>';
    } else {
      if (searchTerm && searchTerm.trim() !== '') {
        html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No consents found matching "' + searchTerm + '"</span></div>';
      } else {
        html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No consents available</span></div>';
      }
    }
    $('#consents').html(html);
  }
  
  // Make displayConsents globally accessible for search
  window.displayConsents = displayConsents;
  
  function displayCoverage(coverages) {
    var html = '';
    
    if (coverages && coverages.length > 0) {
      // Sort coverages by period start date (most recent first)
      var sortedCoverages = coverages.sort(function(a, b) {
        var dateA = new Date((a.period && a.period.start) || (a.meta && a.meta.lastUpdated) || 0);
        var dateB = new Date((b.period && b.period.start) || (b.meta && b.meta.lastUpdated) || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul style="list-style: none; padding: 0; margin: 0;">';
      sortedCoverages.forEach(function(coverage) {
        var coverageId = coverage.id || 'Unknown';
        
        // Extract status
        var status = formatStatus(coverage.status) || 'Unknown';
        var statusClass = coverage.status === 'active' ? 'success' : 
                         (coverage.status === 'cancelled' ? 'warning' : 
                         (coverage.status === 'draft' ? 'info' : 'secondary'));
        
        // Extract type
        var type = '-';
        if (coverage.type && coverage.type.coding && coverage.type.coding.length > 0) {
          type = coverage.type.coding[0].display || coverage.type.coding[0].code || '-';
        } else if (coverage.type && coverage.type.text) {
          type = coverage.type.text;
        }
        
        // Extract subscriber information
        var subscriber = '-';
        var subscriberId = '-';
        if (coverage.subscriber && coverage.subscriber.reference) {
          subscriber = coverage.subscriber.reference;
        } else if (coverage.subscriber && coverage.subscriber.display) {
          subscriber = coverage.subscriber.display;
        }
        if (coverage.subscriberId) {
          subscriberId = coverage.subscriberId;
        }
        
        // Extract beneficiary
        var beneficiary = '-';
        if (coverage.beneficiary && coverage.beneficiary.reference) {
          beneficiary = coverage.beneficiary.reference;
        } else if (coverage.beneficiary && coverage.beneficiary.display) {
          beneficiary = coverage.beneficiary.display;
        }
        
        // Extract dependent number
        var dependent = '-';
        if (coverage.dependent) {
          dependent = coverage.dependent;
        }
        
        // Extract relationship to subscriber
        var relationship = '-';
        if (coverage.relationship && coverage.relationship.coding && coverage.relationship.coding.length > 0) {
          relationship = coverage.relationship.coding[0].display || coverage.relationship.coding[0].code || '-';
        } else if (coverage.relationship && coverage.relationship.text) {
          relationship = coverage.relationship.text;
        }
        
        // Extract period
        var periodStart = '-';
        var periodEnd = '-';
        if (coverage.period) {
          if (coverage.period.start) {
            periodStart = new Date(coverage.period.start).toLocaleDateString();
          }
          if (coverage.period.end) {
            periodEnd = new Date(coverage.period.end).toLocaleDateString();
          }
        }
        
        // Extract payor (insurance company)
        var payor = '-';
        if (coverage.payor && coverage.payor.length > 0) {
          var payors = [];
          coverage.payor.forEach(function(p) {
            if (p.display) {
              payors.push(p.display);
            } else if (p.reference) {
              payors.push(p.reference);
            }
          });
          if (payors.length > 0) {
            payor = payors.join(', ');
          }
        }
        
        // Extract coverage class information
        var classInfo = [];
        if (coverage.class && coverage.class.length > 0) {
          coverage.class.forEach(function(cls) {
            var classType = cls.type && cls.type.coding && cls.type.coding[0] ? 
                           (cls.type.coding[0].display || cls.type.coding[0].code) : 
                           (cls.type && cls.type.text ? cls.type.text : 'Unknown');
            var classValue = cls.value || '-';
            var className = cls.name || '-';
            classInfo.push(classType + ': ' + classValue + (className !== '-' ? ' (' + className + ')' : ''));
          });
        }
        
        // Extract cost to beneficiary
        var costToBeneficiary = '-';
        if (coverage.costToBeneficiary && coverage.costToBeneficiary.length > 0) {
          var costs = [];
          coverage.costToBeneficiary.forEach(function(cost) {
            var costType = cost.type && cost.type.coding && cost.type.coding[0] ? 
                          (cost.type.coding[0].display || cost.type.coding[0].code) : 
                          (cost.type && cost.type.text ? cost.type.text : 'Unknown');
            var costValue = '-';
            if (cost.valueQuantity) {
              costValue = (cost.valueQuantity.value || '') + ' ' + (cost.valueQuantity.unit || '');
            } else if (cost.valueMoney) {
              costValue = (cost.valueMoney.value || '') + ' ' + (cost.valueMoney.currency || '');
            }
            costs.push(costType + ': ' + costValue);
          });
          if (costs.length > 0) {
            costToBeneficiary = costs.join('; ');
          }
        }
        
        // Extract subrogation
        var subrogation = '-';
        if (typeof coverage.subrogation === 'boolean') {
          subrogation = coverage.subrogation ? 'Yes' : 'No';
        }
        
        // Extract contract references
        var contract = '-';
        if (coverage.contract && coverage.contract.length > 0) {
          var contracts = [];
          coverage.contract.forEach(function(cont) {
            if (cont.display) {
              contracts.push(cont.display);
            } else if (cont.reference) {
              contracts.push(cont.reference);
            }
          });
          if (contracts.length > 0) {
            contract = contracts.join(', ');
          }
        }
        
        // Extract order
        var order = '-';
        if (coverage.order !== undefined && coverage.order !== null) {
          order = coverage.order.toString();
        }
        
        html += '<li style="margin-bottom: 12px; border-radius: 4px; border: 1px solid #e0e0e0; padding: 12px; background: #fff;">';
        html += '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">';
        html += '<div style="flex: 1;">';
        html += '<div style="font-size: 1.1em; font-weight: 600; color: #007bff; margin-bottom: 4px;">';
        html += '<span class="badge badge-' + statusClass + '" style="padding: 2px 6px; border-radius: 3px; font-size: 0.8em; font-weight: 600; margin-right: 8px;">' + status + '</span>';
        html += payor !== '-' ? payor : (type !== '-' ? type : 'Coverage');
        html += '</div>';
        html += '<div style="font-size: 0.85em; color: #666; margin-top: 4px;">';
        html += '<span style="margin-right: 12px;"><strong>ID:</strong> ' + coverageId + '</span>';
        if (type !== '-') {
          html += '<span style="margin-right: 12px;"><strong>Type:</strong> ' + type + '</span>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';
        
        // Details grid
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0f0f0; font-size: 0.9em;">';
        if (payor !== '-') {
          html += '<div><strong style="color: #666;">Payor (Insurance):</strong> ' + payor + '</div>';
        }
        if (subscriber !== '-') {
          html += '<div><strong style="color: #666;">Subscriber:</strong> ' + subscriber + '</div>';
        }
        if (subscriberId !== '-') {
          html += '<div><strong style="color: #666;">Subscriber ID:</strong> ' + subscriberId + '</div>';
        }
        if (beneficiary !== '-') {
          html += '<div><strong style="color: #666;">Beneficiary:</strong> ' + beneficiary + '</div>';
        }
        if (dependent !== '-') {
          html += '<div><strong style="color: #666;">Dependent Number:</strong> ' + dependent + '</div>';
        }
        if (relationship !== '-') {
          html += '<div><strong style="color: #666;">Relationship:</strong> ' + relationship + '</div>';
        }
        if (periodStart !== '-') {
          html += '<div><strong style="color: #666;">Coverage Start:</strong> ' + periodStart + '</div>';
        }
        if (periodEnd !== '-') {
          html += '<div><strong style="color: #666;">Coverage End:</strong> ' + periodEnd + '</div>';
        }
        if (order !== '-') {
          html += '<div><strong style="color: #666;">Order:</strong> ' + order + '</div>';
        }
        if (subrogation !== '-') {
          html += '<div><strong style="color: #666;">Subrogation:</strong> ' + subrogation + '</div>';
        }
        if (contract !== '-') {
          html += '<div><strong style="color: #666;">Contract:</strong> ' + contract + '</div>';
        }
        if (costToBeneficiary !== '-') {
          html += '<div style="grid-column: 1 / -1;"><strong style="color: #666;">Cost to Beneficiary:</strong> ' + costToBeneficiary + '</div>';
        }
        if (classInfo.length > 0) {
          html += '<div style="grid-column: 1 / -1;"><strong style="color: #666;">Coverage Class:</strong> ' + classInfo.join('; ') + '</div>';
        }
        html += '</div>';
        
        html += '</li>';
      });
      html += '</ul>';
    } else {
      html = '<div class="no-data"><i class="fas fa-info-circle"></i><span>No coverage available</span></div>';
    }
    $('#coverage').html(html);
  }
  
  // Make displayCoverage globally accessible
  window.displayCoverage = displayCoverage;
  
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

  /**
   * Load and display RA Data Points for Protocols (FHIR Experiments page)
   */
  window.loadRADataPoints = function() {
    if (!window.smartClient) {
      alert('SMART client not initialized. Please launch the app from an EHR (e.g., SMART Health IT sandbox).');
      return;
    }
    resetRaApiSources();
    var smart = window.smartClient;
    var patientId = smart.patient && smart.patient.id;
    if (!patientId) {
      alert('No patient context. Please launch from an EHR with a patient selected.');
      return;
    }
    var fhirVersion = smart.state.serverUrl.indexOf('/r2/') >= 0 ? 'R2' : 'R4';
    var medResource = fhirVersion === 'R2' ? 'MedicationOrder' : 'MedicationRequest';
    
    function buildUrl(resource, params) {
      var url = smart.state.serverUrl + '/' + resource;
      var parts = [];
      for (var k in params) { if (params.hasOwnProperty(k)) { parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k])); } }
      return url + (parts.length ? '?' + parts.join('&') : '');
    }
    function req(url, name) {
      return smart.request({ url: wrapWithProxy(url), headers: { Accept: 'application/fhir+json' } })
        .catch(function(e) { console.warn('RA: Failed to fetch ' + name, e); return null; });
    }
    
    function setEl(id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val != null && val !== '' ? val : '-';
    }
    
    function setApiSource(fieldId, activeApi) {
      var apiEl = document.getElementById(fieldId + '-api');
      if (!apiEl) return;
      var allApis = (apiEl.getAttribute('data-apis') || '').split(',').map(function(s) { return s.trim(); });
      var activeList = (activeApi || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);
      var html = allApis.map(function(api) {
        var isActive = activeList.length > 0 && activeList.indexOf(api) >= 0;
        return '<span class="ra-api' + (isActive ? ' ra-api-active' : '') + '" data-api="' + api + '">' + api.replace(/([A-Z])/g, ' $1').trim() + '</span>';
      }).join(', ');
      apiEl.innerHTML = html;
    }
    
    function resetRaApiSources() {
      var ids = ['ra-patient-id','ra-dob','ra-age','ra-pregnancy-test-date','ra-pregnancy-test-result','ra-pregnancy','ra-weight','ra-weight-date','ra-weight-history','ra-active-meds','ra-last-refill-date','ra-refill-quantity','ra-dosage','ra-frequency','ra-prescribed-date','ra-dosage-start-date','ra-refill-indicator','ra-special-requirements','ra-delivery-type','ra-conditions','ra-diagnosis-date','ra-acute-conditions','ra-chronic-conditions','ra-visits-past-dates','ra-visits-past-types','ra-visits-planned-dates','ra-visits-planned-types','ra-labs-list','ra-labs-dates','ra-labs-results'];
      ids.forEach(function(id) { setApiSource(id, null); });
    }
    
    window._raPregFromProc = null;
    window._raPregFromCond = null;
    window._raPregFromObs = null;
    window._raPregFromDr = null;
    function applyRAPregnancyData() {
      var fromProc = window._raPregFromProc;
      var fromCond = window._raPregFromCond;
      var fromObs = window._raPregFromObs;
      var fromDr = window._raPregFromDr;
      var date = (fromProc && fromProc.date) || (fromObs && fromObs.date) || (fromDr && fromDr.date) || '-';
      var result = (fromProc && fromProc.result) || (fromObs && fromObs.result) || (fromDr && fromDr.result) || (fromCond && (typeof fromCond === 'object' ? fromCond.result : null)) || '-';
      var condDisplay = fromCond && (typeof fromCond === 'object' ? fromCond.display : fromCond);
      var pregnancy = condDisplay || result || '-';
      setEl('ra-pregnancy-test-date', date);
      setEl('ra-pregnancy-test-result', result);
      setEl('ra-pregnancy', pregnancy);
      var dateSrc = (fromProc && fromProc.date) ? 'Procedure' : (fromObs && fromObs.date) ? 'Observation' : (fromDr && fromDr.date) ? 'DiagnosticReport' : null;
      var resultSrc = (fromProc && fromProc.result) ? 'Procedure' : (fromObs && fromObs.result) ? 'Observation' : (fromDr && fromDr.result) ? 'DiagnosticReport' : (fromCond && (typeof fromCond === 'object' ? fromCond.result : null)) ? 'Condition' : null;
      var pregSrc = condDisplay ? 'Condition' : resultSrc;
      setApiSource('ra-pregnancy-test-date', dateSrc);
      setApiSource('ra-pregnancy-test-result', resultSrc);
      setApiSource('ra-pregnancy', pregSrc);
    }
    
    var now = new Date();
    var dayMs = 24 * 60 * 60 * 1000;
    var past540 = new Date(now.getTime() - 540 * dayMs);
    var next150 = new Date(now.getTime() + 150 * dayMs);
    
    smart.patient.read().then(function(patient) {
      var p = (patient.resourceType === 'Bundle' && patient.entry && patient.entry[0]) ? patient.entry[0].resource : patient;
      setEl('ra-patient-id', p.id);
      setEl('ra-dob', p.birthDate || '-');
      if (p.birthDate) {
        var birth = new Date(p.birthDate);
        var age = Math.floor((now - birth) / (365.25 * dayMs));
        setEl('ra-age', age + ' years');
      } else { setEl('ra-age', '-'); }
      setApiSource('ra-patient-id', 'Patient');
      setApiSource('ra-dob', 'Patient');
      setApiSource('ra-age', 'Patient');
    }).catch(function() { setEl('ra-patient-id', '-'); setEl('ra-dob', '-'); setEl('ra-age', '-'); });
    
    var obsPregPromise = req(buildUrl('Observation', { patient: patientId, _count: 200 }), 'Observations').then(function(bundle) {
      var obs = (bundle && bundle.entry) ? bundle.entry.map(function(e) { return e.resource; }) : [];
      var weightObs = obs.filter(function(o) {
        var code = (o.code && o.code.coding && o.code.coding[0] && o.code.coding[0].code) || '';
        return code === '29463-7' || code === '3141-9' || (o.code && o.code.text && o.code.text.toLowerCase().indexOf('weight') >= 0);
      }).sort(function(a, b) {
        var da = a.effectiveDateTime || a.issued || '';
        var db = b.effectiveDateTime || b.issued || '';
        return (db || '').localeCompare(da || '');
      });
      var pregCodes = ['26836-4', '26836-8', '2106-3', '2110-5', '2112-1', '2116-4', '2118-8', '80384-1', '80385-8'];
      var pregObs = obs.filter(function(o) {
        var code = (o.code && o.code.coding && o.code.coding[0] && o.code.coding[0].code) || '';
        var text = ((o.code && o.code.text) || '').toLowerCase();
        return pregCodes.indexOf(code) >= 0 || text.indexOf('pregnancy') >= 0 || text.indexOf('hcg') >= 0 || text.indexOf('chorionic') >= 0 || text.indexOf('gonadotropin') >= 0;
      }).sort(function(a, b) {
        var da = a.effectiveDateTime || a.issued || '';
        var db = b.effectiveDateTime || b.issued || '';
        return (db || '').localeCompare(da || '');
      });
      
      if (weightObs.length > 0) {
        var w = weightObs[0];
        var val = (w.valueQuantity && w.valueQuantity.value != null) ? w.valueQuantity.value + ' ' + (w.valueQuantity.unit || 'kg') : '-';
        setEl('ra-weight', val);
        setEl('ra-weight-date', (w.effectiveDateTime || w.issued || '').split('T')[0] || '-');
        var hist = weightObs.slice(0, 5).map(function(x) {
          var v = x.valueQuantity && x.valueQuantity.value;
          var d = (x.effectiveDateTime || x.issued || '').split('T')[0];
          return v != null ? (v + (x.valueQuantity.unit || '') + ' on ' + d) : null;
        }).filter(Boolean).join('; ');
        setEl('ra-weight-history', hist || '-');
        setApiSource('ra-weight', 'Observation');
        setApiSource('ra-weight-date', 'Observation');
        setApiSource('ra-weight-history', 'Observation');
      } else { setEl('ra-weight', '-'); setEl('ra-weight-date', '-'); setEl('ra-weight-history', '-'); }
      
      var obsDate = '';
      var obsResult = '';
      if (pregObs.length > 0) {
        var pr = pregObs[0];
        obsDate = (pr.effectiveDateTime || pr.issued || '').split('T')[0] || '';
        obsResult = (pr.valueCodeableConcept && (pr.valueCodeableConcept.text || (pr.valueCodeableConcept.coding && pr.valueCodeableConcept.coding[0] && pr.valueCodeableConcept.coding[0].display))) || (pr.valueString) || (pr.valueBoolean !== undefined ? (pr.valueBoolean ? 'Positive' : 'Negative') : '') || (pr.valueQuantity && pr.valueQuantity.value != null ? (pr.valueQuantity.value + ' ' + (pr.valueQuantity.unit || pr.valueQuantity.code || '')).trim() : '') || (pr.component && pr.component[0] && ((pr.component[0].valueCodeableConcept && (pr.component[0].valueCodeableConcept.text || (pr.component[0].valueCodeableConcept.coding && pr.component[0].valueCodeableConcept.coding[0] && pr.component[0].valueCodeableConcept.coding[0].display))) || (pr.component[0].valueString) || (pr.component[0].valueQuantity && pr.component[0].valueQuantity.value != null ? pr.component[0].valueQuantity.value + ' ' + (pr.component[0].valueQuantity.unit || '') : ''))) || '';
      }
      window._raPregFromObs = { date: obsDate, result: obsResult };
      applyRAPregnancyData();
    });
    
    var procPromise = req(buildUrl('Procedure', { patient: patientId, _count: 100 }), 'Procedures').then(function(procBundle) {
      var procs = (procBundle && procBundle.entry) ? procBundle.entry.map(function(e) { return e.resource; }) : [];
      var pregProcs = procs.filter(function(p) {
        var code = (p.code && p.code.coding && p.code.coding[0] && p.code.coding[0].code) || '';
        var text = ((p.code && p.code.text) || '').toLowerCase();
        return code === '26836-4' || code === '26836-8' || code === '16932000' || code === '10288007' || text.indexOf('pregnancy') >= 0 || text.indexOf('hcg') >= 0 || text.indexOf('chorionic') >= 0;
      }).sort(function(a, b) {
        var da = a.performedDateTime || (a.performedPeriod && (a.performedPeriod.start || a.performedPeriod.end)) || '';
        var db = b.performedDateTime || (b.performedPeriod && (b.performedPeriod.start || b.performedPeriod.end)) || '';
        return (db || '').localeCompare(da || '');
      });
      var date = '';
      var result = '';
      if (pregProcs.length > 0) {
        var pp = pregProcs[0];
        date = (pp.performedDateTime || (pp.performedPeriod && (pp.performedPeriod.start || pp.performedPeriod.end)) || '').split('T')[0] || '';
        result = (pp.outcome && (pp.outcome.text || (pp.outcome.coding && pp.outcome.coding[0] && pp.outcome.coding[0].display))) || '';
      }
      window._raPregFromProc = { date: date, result: result };
    });
    
    var drPromise = req(buildUrl('DiagnosticReport', { patient: patientId, _count: 100 }), 'DiagnosticReport').then(function(drBundle) {
      var reports = (drBundle && drBundle.entry) ? drBundle.entry.map(function(e) { return e.resource; }) : [];
      var pregDrs = reports.filter(function(r) {
        var codeStr = (r.code && r.code.coding && r.code.coding[0]) ? ((r.code.coding[0].code || '') + ' ' + (r.code.coding[0].display || '') + ' ' + (r.code.text || '')).toLowerCase() : '';
        var concl = ((r.conclusion || '') + ' ' + (r.conclusionCode && r.conclusionCode[0] && (r.conclusionCode[0].text || (r.conclusionCode[0].coding && r.conclusionCode[0].coding[0] && r.conclusionCode[0].coding[0].display)) || '')).toLowerCase();
        return codeStr.indexOf('pregnancy') >= 0 || codeStr.indexOf('hcg') >= 0 || codeStr.indexOf('chorionic') >= 0 || concl.indexOf('pregnancy') >= 0 || concl.indexOf('hcg') >= 0 || concl.indexOf('chorionic') >= 0;
      }).sort(function(a, b) {
        var da = (a.effectiveDateTime || (a.effectivePeriod && (a.effectivePeriod.start || a.effectivePeriod.end)) || '').split('T')[0];
        var db = (b.effectiveDateTime || (b.effectivePeriod && (b.effectivePeriod.start || b.effectivePeriod.end)) || '').split('T')[0];
        return (db || '').localeCompare(da || '');
      });
      var drDate = '';
      var drResult = '';
      if (pregDrs.length > 0) {
        var pd = pregDrs[0];
        drDate = (pd.effectiveDateTime || (pd.effectivePeriod && (pd.effectivePeriod.start || pd.effectivePeriod.end)) || '').split('T')[0] || '';
        drResult = (pd.conclusion || (pd.conclusionCode && pd.conclusionCode[0] && (pd.conclusionCode[0].text || (pd.conclusionCode[0].coding && pd.conclusionCode[0].coding[0] && pd.conclusionCode[0].coding[0].display)))) || '';
      }
      window._raPregFromDr = { date: drDate, result: drResult };
    });
    
    req(buildUrl(medResource, { patient: patientId, status: 'active', _count: 100 }), 'Medications').then(function(medBundle) {
      var meds = (medBundle && medBundle.entry) ? medBundle.entry.map(function(e) { return e.resource; }) : [];
      var names = meds.map(function(m) {
        return (m.medicationCodeableConcept && (m.medicationCodeableConcept.text || (m.medicationCodeableConcept.coding && m.medicationCodeableConcept.coding[0] && m.medicationCodeableConcept.coding[0].display))) || (m.medicationReference && m.medicationReference.display) || 'Unknown';
      }).join(', ');
      setEl('ra-active-meds', names || '-');
      var dosages = meds.map(function(m) {
        var d = m.dosageInstruction && m.dosageInstruction[0];
        if (!d) return null;
        var text = d.text || '';
        if (!text && d.doseAndRate && d.doseAndRate[0]) {
          var dr = d.doseAndRate[0];
          if (dr.doseQuantity) text = dr.doseQuantity.value + ' ' + (dr.doseQuantity.unit || '');
          if (dr.timing && dr.timing.code && dr.timing.code.text) text += (text ? ' ' : '') + dr.timing.code.text;
        }
        return text;
      }).filter(Boolean).join('; ');
      setEl('ra-dosage', dosages || '-');
      var freqs = meds.map(function(m) {
        var d = m.dosageInstruction && m.dosageInstruction[0];
        return (d && d.timing && d.timing.code && d.timing.code.text) ? d.timing.code.text : null;
      }).filter(Boolean).join('; ');
      setEl('ra-frequency', freqs || '-');
      var authDates = meds.map(function(m) { return m.authoredOn ? m.authoredOn.split('T')[0] : null; }).filter(Boolean);
      setEl('ra-prescribed-date', authDates.length ? authDates.join(', ') : '-');
      setEl('ra-dosage-start-date', authDates[0] || '-');
      if (meds.length > 0) {
        setApiSource('ra-active-meds', 'MedicationRequest');
        setApiSource('ra-dosage', 'MedicationRequest');
        setApiSource('ra-frequency', 'MedicationRequest');
        setApiSource('ra-prescribed-date', 'MedicationRequest');
        setApiSource('ra-dosage-start-date', 'MedicationRequest');
      }
    });
    
    req(buildUrl('MedicationDispense', { patient: patientId, _count: 100 }), 'MedicationDispense').then(function(dispBundle) {
      var dispenses = (dispBundle && dispBundle.entry) ? dispBundle.entry.map(function(e) { return e.resource; }) : [];
      if (dispenses.length > 0) {
        var sorted = dispenses.sort(function(a, b) {
          var da = a.whenHandedOver || a.whenPrepared || '';
          var db = b.whenHandedOver || b.whenPrepared || '';
          return (db || '').localeCompare(da || '');
        });
        var last = sorted[0];
        setEl('ra-last-refill-date', (last.whenHandedOver || last.whenPrepared || '').split('T')[0] || '-');
        var qty = (last.quantity && last.quantity.value != null) ? last.quantity.value + ' ' + (last.quantity.unit || '') : '-';
        setEl('ra-refill-quantity', qty);
        setApiSource('ra-last-refill-date', 'MedicationDispense');
        setApiSource('ra-refill-quantity', 'MedicationDispense');
      } else { setEl('ra-last-refill-date', '-'); setEl('ra-refill-quantity', '-'); }
    });
    
    var condPregPromise = req(buildUrl('Condition', { patient: patientId, _count: 100 }), 'Conditions').then(function(condBundle) {
      var conds = (condBundle && condBundle.entry) ? condBundle.entry.map(function(e) { return e.resource; }) : [];
      var pregCond = conds.find(function(c) {
        var code = (c.code && c.code.coding && c.code.coding[0] && c.code.coding[0].code) || '';
        var text = ((c.code && c.code.text) || '').toLowerCase();
        return code === '77386006' || code === '72892002' || text.indexOf('pregnancy') >= 0 || text.indexOf('pregnant') >= 0;
      });
      var condDisplay = null;
      var condResult = null;
      if (pregCond) {
        condDisplay = (pregCond.code && pregCond.code.text) || (pregCond.code && pregCond.code.coding && pregCond.code.coding[0] && pregCond.code.coding[0].display) || 'Pregnancy';
        var verif = (pregCond.verificationStatus && pregCond.verificationStatus.coding && pregCond.verificationStatus.coding[0] && pregCond.verificationStatus.coding[0].code) || (pregCond.verificationStatus && pregCond.verificationStatus.coding && pregCond.verificationStatus.coding[0] && pregCond.verificationStatus.coding[0].display);
        if (verif === 'confirmed' || verif === 'verified') condResult = 'Positive (Confirmed)';
        else if (verif === 'refuted') condResult = 'Negative';
        else if (verif === 'entered-in-error') condResult = 'Entered in Error';
        else condResult = condDisplay;
      }
      window._raPregFromCond = pregCond ? { display: condDisplay, result: condResult } : null;
      var allConds = conds.map(function(c) {
        return (c.code && c.code.text) || (c.code && c.code.coding && c.code.coding[0] && c.code.coding[0].display) || 'Unknown';
      }).join(', ');
      setEl('ra-conditions', allConds || '-');
      var onsetDates = conds.map(function(c) { return c.onsetDateTime ? c.onsetDateTime.split('T')[0] : null; }).filter(Boolean);
      setEl('ra-diagnosis-date', onsetDates.length ? onsetDates.join(', ') : '-');
      var acute = conds.filter(function(c) {
        var s = (c.clinicalStatus && c.clinicalStatus.coding && c.clinicalStatus.coding[0] && c.clinicalStatus.coding[0].code) || '';
        return s === 'active' && (c.verificationStatus && (c.verificationStatus.coding && c.verificationStatus.coding[0] && c.verificationStatus.coding[0].code) === 'confirmed');
      }).map(function(c) {
        return (c.code && c.code.text) || (c.code && c.code.coding && c.code.coding[0] && c.code.coding[0].display) || '';
      }).filter(Boolean).join(', ');
      var chronic = conds.filter(function(c) {
        return (c.bodySite && c.bodySite.length > 0) || ((c.code && c.code.coding && c.code.coding[0] && (c.code.coding[0].code + '').indexOf('chronic') >= 0));
      }).map(function(c) {
        return (c.code && c.code.text) || (c.code && c.code.coding && c.code.coding[0] && c.code.coding[0].display) || '';
      }).filter(Boolean).join(', ');
      setEl('ra-acute-conditions', acute || '-');
      setEl('ra-chronic-conditions', chronic || '-');
      if (conds.length > 0) {
        setApiSource('ra-conditions', 'Condition');
        setApiSource('ra-diagnosis-date', 'Condition');
        setApiSource('ra-acute-conditions', 'Condition');
        setApiSource('ra-chronic-conditions', 'Condition');
      }
    });
    Promise.all([obsPregPromise, procPromise, condPregPromise, drPromise]).then(function() { applyRAPregnancyData(); });
    
    // Encounters = Visits in FHIR
    var encParams = { patient: patientId, _count: 200 };
    req(buildUrl('Encounter', encParams), 'Encounters').then(function(encBundle) {
      var encs = (encBundle && encBundle.entry) ? encBundle.entry.map(function(e) { return e.resource; }) : [];
      function getEncDate(e) {
        if (e.period && e.period.start) return e.period.start;
        if (e.period && e.period.end) return e.period.end;
        if (e.meta && e.meta.lastUpdated) return e.meta.lastUpdated;
        return null;
      }
      var pastVisits = encs.filter(function(e) {
        if (e.status === 'cancelled') return false;
        var d = getEncDate(e);
        if (!d) return true; // Include if no date (let server decide)
        var dt = new Date(d);
        return dt >= past540 && dt <= now;
      });
      pastVisits.sort(function(a, b) {
        var da = getEncDate(a) || '';
        var db = getEncDate(b) || '';
        return (db || '').localeCompare(da || '');
      });
      var plannedVisits = encs.filter(function(e) {
        var d = e.period && e.period.start;
        if (!d) return false;
        var dt = new Date(d);
        return dt >= now && dt <= next150 && (e.status === 'planned' || e.status === 'booked');
      });
      plannedVisits.sort(function(a, b) {
        var da = (a.period && a.period.start) || '';
        var db = (b.period && b.period.start) || '';
        return (da || '').localeCompare(db || '');
      });
      setEl('ra-visits-past-dates', pastVisits.length ? pastVisits.map(function(e) { var d = getEncDate(e) || ''; return d.split('T')[0]; }).join(', ') : 'No encounters in last 540 days');
      setEl('ra-visits-past-types', pastVisits.length ? pastVisits.map(function(e) { var t = e.type && e.type[0] && (e.type[0].text || (e.type[0].coding && e.type[0].coding[0] && e.type[0].coding[0].display)); return t || e.class ? (e.class.display || e.class.code) : 'Visit'; }).join(', ') : '-');
      setEl('ra-visits-planned-dates', plannedVisits.length ? plannedVisits.map(function(e) { var d = (e.period && e.period.start) || ''; return d.split('T')[0]; }).join(', ') : 'No planned visits in next 150 days');
      setEl('ra-visits-planned-types', plannedVisits.length ? plannedVisits.map(function(e) { var t = e.type && e.type[0] && (e.type[0].text || (e.type[0].coding && e.type[0].coding[0] && e.type[0].coding[0].display)); return t || 'Planned'; }).join(', ') : '-');
      if (pastVisits.length > 0 || plannedVisits.length > 0) {
        setApiSource('ra-visits-past-dates', 'Encounter');
        setApiSource('ra-visits-past-types', 'Encounter');
        setApiSource('ra-visits-planned-dates', 'Encounter');
        setApiSource('ra-visits-planned-types', 'Encounter');
      }
    });
    
    req(buildUrl('DiagnosticReport', { patient: patientId, _count: 100 }), 'DiagnosticReport').then(function(drBundle) {
      var reports = (drBundle && drBundle.entry) ? drBundle.entry.map(function(e) { return e.resource; }) : [];
      var obsUrl = buildUrl('Observation', { patient: patientId, _count: 200 });
      req(obsUrl, 'Labs').then(function(obsBundle) {
        var labObs = (obsBundle && obsBundle.entry) ? obsBundle.entry.map(function(e) { return e.resource; }) : [];
        var labTypes = ['laboratory', 'Lab', 'lab'];
        var labs = labObs.filter(function(o) {
          var cat = (o.category && o.category[0] && o.category[0].coding && o.category[0].coding[0] && o.category[0].coding[0].code) || '';
          var catText = (o.category && o.category[0] && o.category[0].text) || '';
          return labTypes.indexOf(cat) >= 0 || labTypes.some(function(t) { return catText.toLowerCase().indexOf(t.toLowerCase()) >= 0; });
        });
        var list = labs.length ? labs.map(function(o) { return (o.code && o.code.text) || (o.code && o.code.coding && o.code.coding[0] && o.code.coding[0].display) || o.code.coding[0].code; }).filter(Boolean).join(', ') : (reports.length ? reports.map(function(r) { return r.code && (r.code.text || (r.code.coding && r.code.coding[0] && r.code.coding[0].display)); }).filter(Boolean).join(', ') : '-');
        setEl('ra-labs-list', list || '-');
        var dates = labs.length ? labs.map(function(o) { return (o.effectiveDateTime || o.issued || '').split('T')[0]; }).filter(Boolean).join(', ') : (reports.length ? reports.map(function(r) { return (r.effectiveDateTime || r.issued || '').split('T')[0]; }).filter(Boolean).join(', ') : '-');
        setEl('ra-labs-dates', dates || '-');
        var results = labs.map(function(o) {
          var val = (o.valueQuantity && o.valueQuantity.value != null) ? o.valueQuantity.value + ' ' + (o.valueQuantity.unit || '') : (o.valueCodeableConcept && (o.valueCodeableConcept.text || (o.valueCodeableConcept.coding && o.valueCodeableConcept.coding[0] && o.valueCodeableConcept.coding[0].display))) || o.valueString || '-';
          var name = (o.code && o.code.text) || (o.code && o.code.coding && o.code.coding[0] && o.code.coding[0].display) || '';
          return name ? name + ': ' + val : null;
        }).filter(Boolean).join('; ');
        setEl('ra-labs-results', results || '-');
        if (labs.length > 0 || reports.length > 0) {
          var labSrc = labs.length > 0 ? 'Observation' : 'DiagnosticReport';
          setApiSource('ra-labs-list', labSrc);
          setApiSource('ra-labs-dates', labSrc);
          setApiSource('ra-labs-results', labSrc);
        }
      });
    });
    
    setEl('ra-refill-indicator', '-');
    setEl('ra-special-requirements', '-');
    setEl('ra-delivery-type', '-');
  };

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

