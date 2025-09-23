(function(window){
  window.extractData = function() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart)  {
      console.log('SMART client ready:', smart);
      
      if (smart.hasOwnProperty('patient') && smart.patient) {
        console.log('Patient context available');
        console.log('SMART patient object:', smart.patient);
        console.log('SMART state:', smart.state);
        console.log('SMART user:', smart.user);
        console.log('OAuth token scopes:', smart.state.tokenResponse?.scope);
        console.log('Full token response:', smart.state.tokenResponse);
        console.log('FHIR server URL:', smart.state.serverUrl);
        console.log('Client ID:', smart.state.clientId);
        var patient = smart.patient;
        
        // Check if patient.read is available
        if (typeof patient.read === 'function') {
          console.log('Patient.read function available');
          try {
            var pt = patient.read();
            console.log('Patient.read() called successfully');
          } catch (error) {
            console.log('Patient.read() failed:', error);
            console.log('Trying alternative approach with smart.patient.request');
            // Try to get patient data directly
            var pt = smart.patient.request({
              type: 'Patient',
              query: {}
            });
          }
        } else {
          console.log('Patient.read function not available, trying alternative approach');
          // Try to get patient data directly
          var pt = smart.patient.request({
            type: 'Patient',
            query: {}
          });
        }
        
        // Add error handling for the patient Promise
        pt = pt.catch(function(error) {
          console.log('Patient.read() Promise failed:', error);
          console.log('Trying alternative approach with smart.request');
          // Try to get patient data directly using smart.request
          return smart.request({
            url: 'Patient',
            query: {}
          });
        });
        
        // Fetch all comprehensive data
        var obv = smart.request({
          url: 'Observation',
          query: { _count: 50 }
        });
        
        var meds = smart.request({
          url: 'MedicationRequest',
          query: { _count: 20 }
        });
        
        var allergies = smart.request({
          url: 'AllergyIntolerance',
          query: { _count: 20 }
        });
        
        var conditions = smart.request({
          url: 'Condition',
          query: { _count: 20 }
        });
        
        var documents = smart.request({
          url: 'DocumentReference',
          query: { _count: 20 }
        });

        // Handle Promises properly
        Promise.all([pt, obv, meds, allergies, conditions, documents]).then(function([patient, obv, meds, allergies, conditions, documents]) {
        // Handle the FHIR client response format
        console.log('Patient data:', patient);
        console.log('Observations data:', obv);
        console.log('Medications data:', meds);
        console.log('Allergies data:', allergies);
        console.log('Conditions data:', conditions);
        console.log('Documents data:', documents);
        
        // Extract patient resource from Bundle if needed
        var patientResource = patient;
        if (patient && patient.resourceType === 'Bundle' && patient.entry && patient.entry.length > 0) {
          patientResource = patient.entry[0].resource;
          console.log('Extracted patient resource from Bundle:', patientResource);
        }
        
        // Process all data
        var observations = processBundle(obv, 'observations');
        var medications = processBundle(meds, 'medications');
        var allergiesList = processBundle(allergies, 'allergies');
        var conditionsList = processBundle(conditions, 'conditions');
        var documentsList = processBundle(documents, 'documents');
        
        function processBundle(bundle, type) {
          if (bundle && bundle.entry) {
            var resources = bundle.entry.map(function(entry) { return entry.resource; });
            console.log('Found ' + type + ' in Bundle.entry:', resources.length);
            return resources;
          } else if (Array.isArray(bundle)) {
            console.log('Found ' + type + ' as direct array:', bundle.length);
            return bundle;
          } else {
            console.log('No ' + type + ' found. Response structure:', bundle);
            return [];
          }
        }
          
          console.log('Processed observations:', observations);
          var byCodes = function(code) {
            if (!Array.isArray(observations)) {
              console.log('Observations is not an array:', observations);
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

          var p = defaultPatient();
          p.birthdate = patientResource.birthDate;
          p.gender = gender;
          p.fname = fname;
          p.lname = lname;
          p.height = getQuantityValueAndUnit(height[0]);

          if (typeof systolicbp != 'undefined')  {
            p.systolicbp = systolicbp;
          }

          if (typeof diastolicbp != 'undefined') {
            p.diastolicbp = diastolicbp;
          }

          p.hdl = getQuantityValueAndUnit(hdl[0]);
          p.ldl = getQuantityValueAndUnit(ldl[0]);
          
          // Add comprehensive data
          p.medications = medications;
          p.allergies = allergiesList;
          p.conditions = conditionsList;
          p.documents = documentsList;

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

    FHIR.oauth2.ready(onReady, onError);
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
          return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function(p) {
    $('#holder').show();
    $('#loading').hide();
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);
    $('#height').html(p.height);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#ldl').html(p.ldl);
    $('#hdl').html(p.hdl);
    
    // Display comprehensive data
    displayMedications(p.medications);
    displayAllergies(p.allergies);
    displayConditions(p.conditions);
    displayDocuments(p.documents);
  };
  
  function displayMedications(medications) {
    var html = '<ul>';
    if (medications && medications.length > 0) {
      medications.forEach(function(med) {
        var medName = 'Unknown';
        if (med.medicationCodeableConcept && med.medicationCodeableConcept.text) {
          medName = med.medicationCodeableConcept.text;
        } else if (med.medicationCodeableConcept && med.medicationCodeableConcept.coding && med.medicationCodeableConcept.coding[0]) {
          medName = med.medicationCodeableConcept.coding[0].display || med.medicationCodeableConcept.coding[0].code;
        }
        var status = med.status || 'Unknown';
        var dosage = '';
        if (med.dosageInstruction && med.dosageInstruction[0] && med.dosageInstruction[0].text) {
          dosage = ' - ' + med.dosageInstruction[0].text;
        }
        html += '<li><strong>' + medName + '</strong> (' + status + ')' + dosage + '</li>';
      });
    } else {
      html += '<li>No medications found</li>';
    }
    html += '</ul>';
    $('#medications').html(html);
  }
  
  function displayAllergies(allergies) {
    var html = '<ul>';
    if (allergies && allergies.length > 0) {
      allergies.forEach(function(allergy) {
        var allergen = 'Unknown';
        if (allergy.code && allergy.code.coding && allergy.code.coding[0]) {
          allergen = allergy.code.coding[0].display || allergy.code.coding[0].code;
        }
        var severity = allergy.criticality || 'Unknown';
        html += '<li><strong>' + allergen + '</strong> (' + severity + ')</li>';
      });
    } else {
      html += '<li>No allergies found</li>';
    }
    html += '</ul>';
    $('#allergies').html(html);
  }
  
  function displayConditions(conditions) {
    var html = '<ul>';
    if (conditions && conditions.length > 0) {
      conditions.forEach(function(condition) {
        var conditionName = 'Unknown';
        if (condition.code && condition.code.coding && condition.code.coding[0]) {
          conditionName = condition.code.coding[0].display || condition.code.coding[0].code;
        }
        var status = condition.clinicalStatus ? condition.clinicalStatus.coding[0].code : 'Unknown';
        html += '<li><strong>' + conditionName + '</strong> (' + status + ')</li>';
      });
    } else {
      html += '<li>No conditions found</li>';
    }
    html += '</ul>';
    $('#conditions').html(html);
  }
  
  function displayDocuments(documents) {
    var html = '<ul>';
    if (documents && documents.length > 0) {
      documents.forEach(function(doc) {
        var docType = 'Unknown';
        if (doc.type && doc.type.coding && doc.type.coding[0]) {
          docType = doc.type.coding[0].display || doc.type.coding[0].code;
        }
        var date = doc.date || 'Unknown date';
        html += '<li><strong>' + docType + '</strong> - ' + date + '</li>';
      });
    } else {
      html += '<li>No documents found</li>';
    }
    html += '</ul>';
    $('#documents').html(html);
  }

})(window);
