(function(window){
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
    console.log('smart.state.tokenResponse:', smart.state?.tokenResponse);
    
    // Try multiple methods to get encounter ID
    var encounterId = null;
    
    // Method 1: Direct method if available
    if (typeof smart.getEncounterId === 'function') {
      encounterId = smart.getEncounterId();
      console.log('Encounter ID from getEncounterId():', encounterId);
    }
    
    // Method 2: From token response
    if (!encounterId && smart.state?.tokenResponse?.encounter) {
      encounterId = smart.state.tokenResponse.encounter;
      console.log('Encounter ID from tokenResponse.encounter:', encounterId);
    }
    
    // Method 3: From launch context
    if (!encounterId && smart.state?.tokenResponse?.launch) {
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
           console.log('SMART client ready:', smart);
           console.log('SMART state:', smart.state);
           console.log('SMART patient:', smart.patient);
           
           if (smart.hasOwnProperty('patient') && smart.patient) {
           var patient = smart.patient;
           
           // Get encounter ID from FHIR client context
           var encounterId = getEncounterIdFromContext(smart);
           
           // Check if patient.read is available
           if (typeof patient.read === 'function') {
             try {
               var pt = patient.read();
             } catch (error) {
               // Try to get patient data directly
               var pt = smart.patient.request({
                 type: 'Patient',
                 query: {}
               });
             }
           } else {
             // Try to get patient data directly
             var pt = smart.patient.request({
               type: 'Patient',
               query: {}
             });
           }
           
           // Add error handling for the patient Promise
           pt = pt.catch(function(error) {
             console.log('Patient read failed, trying direct request:', error);
             // Try to get patient data directly using smart.request
             return smart.request({
               url: 'Patient',
               query: {}
             });
           });
           
           // Set up query parameters based on encounter context
           var queryParams = encounterId ? { encounter: encounterId, _count: 50 } : { _count: 50 };
           
           if (encounterId) {
             console.log('Fetching data for encounter:', encounterId);
           } else {
             console.log('Fetching all patient data (no encounter filter)');
           }
           
           console.log('Observation query params:', queryParams);
        
        // Fetch all comprehensive data
        var obv = smart.request({
          url: 'Observation',
          query: queryParams
        });
        
        // Determine FHIR version and use appropriate resource names
        var fhirVersion = smart.state.serverUrl.includes('/r2/') ? 'R2' : 'R4';
        
        var meds, allergies, conditions, documents;
        
        var medQuery = encounterId ? { encounter: encounterId, _count: 20 } : { _count: 20 };
        var allergyQuery = encounterId ? { encounter: encounterId, _count: 20 } : { _count: 20 };
        var conditionQuery = encounterId ? { encounter: encounterId, _count: 20 } : { _count: 20 };
        var docQuery = encounterId ? { encounter: encounterId, _count: 20 } : { _count: 20 };
        
        console.log('Medication query params:', medQuery);
        console.log('Allergy query params:', allergyQuery);
        console.log('Condition query params:', conditionQuery);
        console.log('Document query params:', docQuery);
        
        if (fhirVersion === 'R2') {
          // DSTU2 (R2) resource names and structures
          meds = smart.request({
            url: 'MedicationOrder',
            query: medQuery
          });
          allergies = smart.request({
            url: 'AllergyIntolerance',
            query: allergyQuery
          });
          conditions = smart.request({
            url: 'Condition',
            query: conditionQuery
          });
          documents = smart.request({
            url: 'DocumentReference',
            query: docQuery
          });
        } else {
          // R4 resource names
          meds = smart.request({
            url: 'MedicationRequest',
            query: medQuery
          });
          allergies = smart.request({
            url: 'AllergyIntolerance',
            query: allergyQuery
          });
          conditions = smart.request({
            url: 'Condition',
            query: conditionQuery
          });
          documents = smart.request({
            url: 'DocumentReference',
            query: docQuery
          });
        }

        // Handle Promises properly with individual error handling
        Promise.allSettled([pt, obv, meds, allergies, conditions, documents]).then(function(results) {
          var patient = results[0].status === 'fulfilled' ? results[0].value : null;
          var obv = results[1].status === 'fulfilled' ? results[1].value : null;
          var meds = results[2].status === 'fulfilled' ? results[2].value : null;
          var allergies = results[3].status === 'fulfilled' ? results[3].value : null;
          var conditions = results[4].status === 'fulfilled' ? results[4].value : null;
          var documents = results[5].status === 'fulfilled' ? results[5].value : null;
          
          // Log any failures
          results.forEach(function(result, index) {
            if (result.status === 'rejected') {
              var resourceNames = fhirVersion === 'R2' ? 
                ['Patient', 'Observation', 'MedicationOrder', 'AllergyIntolerance', 'Condition', 'DocumentReference'] :
                ['Patient', 'Observation', 'MedicationRequest', 'AllergyIntolerance', 'Condition', 'DocumentReference'];
              console.log('Failed to fetch ' + resourceNames[index] + ':', result.reason);
            }
          });
        // Handle the FHIR client response format
        
        // Extract patient resource from Bundle if needed
        var patientResource = patient;
        if (patient && patient.resourceType === 'Bundle' && patient.entry && patient.entry.length > 0) {
          patientResource = patient.entry[0].resource;
        }
        
           // Process all data
           var observations = processBundle(obv, 'observations');
           var medications = processBundle(meds, 'medications');
           var allergiesList = processBundle(allergies, 'allergies');
           var conditionsList = processBundle(conditions, 'conditions');
           var documentsList = processBundle(documents, 'documents');
           
           // Debug: Check if observations are actually filtered by encounter
           if (encounterId && observations.length > 0) {
             console.log('=== ENCOUNTER FILTERING DEBUG ===');
             console.log('Total observations returned:', observations.length);
             console.log('Looking for observations with encounter:', encounterId);
             
             var encounterFilteredObs = observations.filter(function(obs) {
               return obs.context && obs.context.reference && 
                      obs.context.reference.includes(encounterId);
             });
             
             console.log('Observations actually linked to encounter:', encounterFilteredObs.length);
             
             if (encounterFilteredObs.length === 0) {
               console.log('⚠️  No observations found for this encounter - SMART Health IT test data may not support encounter filtering');
               console.log('Sample observation context:', observations[0]?.context);
             } else {
               console.log('✅ Found encounter-specific observations');
             }
             console.log('=====================================');
           }
        
        
        function processBundle(bundle, type) {
          if (bundle && bundle.entry) {
            var resources = bundle.entry.map(function(entry) { return entry.resource; });
            console.log(type + ' Bundle JSON:', bundle);
            return resources;
          } else if (Array.isArray(bundle)) {
            console.log(type + ' Array JSON:', bundle);
            return bundle;
          } else {
            return [];
          }
        }

          
          var byCodes = function(code) {
            if (!Array.isArray(observations)) {
              return [];
            }
            return observations.filter(function(obs) {
              if (obs && obs.code && obs.code.coding) {
                return obs.code.coding.some(function(coding) {
                  return coding.code === code;
                });
              }
              return false;
            });
          };
          var gender = patientResource.gender;

          var fname = '';
          var lname = '';

          if (typeof patientResource.name !== 'undefined' && patientResource.name.length > 0) {
            if (typeof patientResource.name[0].given !== 'undefined') {
              // Handle both DSTU2 (array) and R4 (string) formats
              if (Array.isArray(patientResource.name[0].given)) {
                fname = patientResource.name[0].given.join(' ');
              } else {
                fname = patientResource.name[0].given;
              }
            }
            if (typeof patientResource.name[0].family !== 'undefined') {
              // Handle both DSTU2 (array) and R4 (string) formats
              if (Array.isArray(patientResource.name[0].family)) {
                lname = patientResource.name[0].family.join(' ');
              } else {
                lname = patientResource.name[0].family;
              }
            }
          }

          var height = byCodes('8302-2');
          var systolicbp = getBloodPressureValue(byCodes('55284-4'),'8480-6');
          var diastolicbp = getBloodPressureValue(byCodes('55284-4'),'8462-4');
          var hdl = byCodes('2085-9');
          var ldl = byCodes('2089-1');

          // Sort observations by date to get the most recent
          function sortByDate(obs) {
            // Create a copy of the array to avoid modifying the original
            var sortedObs = obs.slice();
            return sortedObs.sort(function(a, b) {
              var dateA = new Date(a.effectiveDateTime || a.issued || a.meta?.lastUpdated || 0);
              var dateB = new Date(b.effectiveDateTime || b.issued || b.meta?.lastUpdated || 0);
              return dateB - dateA; // Most recent first
            });
          }

          var p = defaultPatient();
          p.birthdate = patientResource.birthDate;
          p.gender = gender;
          p.fname = fname;
          p.lname = lname;
          
          // Store all observations for each vital sign type
          p.heightObservations = height && height.length > 0 ? sortByDate(height) : [];
          p.hdlObservations = hdl && hdl.length > 0 ? sortByDate(hdl) : [];
          p.ldlObservations = ldl && ldl.length > 0 ? sortByDate(ldl) : [];
          
          // For blood pressure, we'll handle it separately since it has a different structure
            p.systolicbp = systolicbp;
            p.diastolicbp = diastolicbp;
          
          // Add comprehensive data
          p.medications = medications;
          p.allergies = allergiesList;
          p.conditions = conditionsList;
          p.documents = documentsList;
          p.observations = observations;

          ret.resolve(p);
        }).catch(function(error) {
          console.log('Promise error:', error);
          onError();
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

  function defaultPatient(){
    return {
      fname: {value: ''},
      lname: {value: ''},
      gender: {value: ''},
      birthdate: {value: ''},
      height: {value: ''},
      systolicbp: {value: ''},
      diastolicbp: {value: ''},
      ldl: {value: ''},
      hdl: {value: ''},
      heightObservations: [],
      hdlObservations: [],
      ldlObservations: []
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];
    BPObservations.forEach(function(observation){
      var BP = observation.component.find(function(component){
        return component.code.coding.find(function(coding) {
          return coding.code == typeOfPressure;
        });
      });
      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
        typeof ob.valueQuantity != 'undefined' &&
        typeof ob.valueQuantity.value != 'undefined' &&
        typeof ob.valueQuantity.unit != 'undefined') {
          
          var value = ob.valueQuantity.value;
          var unit = ob.valueQuantity.unit;
          
          // Round to appropriate decimal places based on unit
          if (unit === 'cm') {
            value = Math.round(value * 10) / 10; // 1 decimal place for height
          } else if (unit === 'mm[Hg]') {
            value = Math.round(value); // Whole numbers for blood pressure
          } else if (unit === 'mg/dL') {
            value = Math.round(value * 10) / 10; // 1 decimal place for cholesterol
          } else {
            value = Math.round(value * 100) / 100; // 2 decimal places default
          }
          
          return value + ' ' + unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function(p) {
    $('#holder').addClass('show');
    $('#loading').hide();
    
    // Update patient demographics
    $('#fname').html(p.fname || '-');
    $('#lname').html(p.lname || '-');
    $('#gender').html(toSentenceCase(p.gender) || '-');
    $('#birthdate').html(p.birthdate || '-');
    
    // Update patient name in header
    var fullName = (p.fname || '') + ' ' + (p.lname || '');
    $('#patient-name-display').html(fullName.trim() || 'Patient');
    
    // Display all observations as a simple list
    displayAllObservations(p.observations);
    
        // Display comprehensive data
        displayMedications(p.medications);
        displayAllergies(p.allergies);
        displayConditions(p.conditions);
        displayDocuments(p.documents);
        
  };
  
  function displayMedications(medications) {
    var html = '';
    if (medications && medications.length > 0) {
      // Sort medications by last updated date (most recent first)
      var sortedMeds = medications.sort(function(a, b) {
        var dateA = new Date(a.meta?.lastUpdated || a.authoredOn || 0);
        var dateB = new Date(b.meta?.lastUpdated || b.authoredOn || 0);
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
        var dateA = new Date(a.meta?.lastUpdated || a.recordedDate || 0);
        var dateB = new Date(b.meta?.lastUpdated || b.recordedDate || 0);
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
        var dateA = new Date(a.onsetDateTime || a.onsetPeriod?.start || a.recordedDate || 0);
        var dateB = new Date(b.onsetDateTime || b.onsetPeriod?.start || b.recordedDate || 0);
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
        var dateA = new Date(a.meta?.lastUpdated || a.date || a.indexed || 0);
        var dateB = new Date(b.meta?.lastUpdated || b.date || b.indexed || 0);
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

  function displayAllObservations(observations) {
    var html = '';
    if (observations && observations.length > 0) {
      // Sort observations by lastUpdated date (most recent first)
      var sortedObservations = observations.sort(function(a, b) {
        var dateA = new Date(a.meta?.lastUpdated || a.effectiveDateTime || a.issued || 0);
        var dateB = new Date(b.meta?.lastUpdated || b.effectiveDateTime || b.issued || 0);
        return dateB - dateA; // Most recent first
      });
      
      html = '<ul>';
      sortedObservations.forEach(function(obs) {
        // Get the observation name/type
        var obsName = 'Unknown';
        if (obs.code && obs.code.coding && obs.code.coding[0]) {
          obsName = obs.code.coding[0].display || obs.code.coding[0].code;
        }
        
        // Get the value
        var value = 'No value';
        if (obs.valueQuantity) {
          value = getQuantityValueAndUnit(obs);
        } else if (obs.valueString) {
          value = obs.valueString;
        } else if (obs.valueBoolean !== undefined) {
          value = obs.valueBoolean.toString();
        }
        
        // Get the date
        var date = obs.effectiveDateTime || obs.issued || obs.meta?.lastUpdated || 'Unknown date';
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

