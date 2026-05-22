import { supabase } from '../lib/supabaseClient.js';

/**
 * Upload file to Supabase Storage
 * @param {File} file - The file to upload
 * @param {string} userId - The user ID
 * @returns {Promise<string>} - The file path in storage
 */
export async function uploadFile(file, userId) {
  if (!file) {
    throw new Error('No file provided');
  }

  // Validate file type
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.');
  }

  // Validate file size (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new Error('File size exceeds 10MB limit.');
  }

  // Create unique filename
  const timestamp = Date.now();
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${timestamp}-${file.name}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('claim-letters')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) {
    console.error('Upload error:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL (for signed URL, use createSignedUrl)
  const { data: urlData } = supabase.storage
    .from('claim-letters')
    .getPublicUrl(fileName);

  return {
    path: data.path,
    fullPath: data.fullPath || fileName,
    publicUrl: urlData.publicUrl
  };
}

/**
 * Save document metadata to database
 * @param {string} userId - The user ID
 * @param {string} fileName - Original filename
 * @param {object} uploadResult - Result from uploadFile
 * @param {object} classification - Claim classification data
 * @returns {Promise<object>} - The created database record
 */
export async function saveDocumentToDatabase(userId, fileName, uploadResult, classification = {}) {
  const { data, error } = await supabase
    .from('claim_letters')
    .insert({
      user_id: userId,
      file_name: fileName,
      original_filename: fileName,
      file_path: uploadResult.path || uploadResult.fullPath,
      claim_type: classification.claimType || null,
      party_type: classification.partyType || null,
      claim_context: classification.claimContext || null,
      claim_amount: classification.claimAmount || null,
      status: 'uploaded'
    })
    .select()
    .single();

  if (error) {
    console.error('Database save error:', error);
    throw new Error(`Failed to save document: ${error.message}`);
  }

  return data;
}

/**
 * Get user's documents from database
 * @param {string} userId - The user ID
 * @returns {Promise<Array>} - Array of user documents
 */
export async function getUserDocuments(userId) {
  const { data, error } = await supabase
    .from('claim_letters')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch documents:', error);
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return data || [];
}

/** Dashboard: medical bill jobs for current user (RLS + user_id must match session). */
export async function getUserMedicalBillJobs(userId) {
  const { data, error } = await supabase
    .from("medical_bill_jobs")
    .select("id, created_at, letter_full, wizard_json, analysis_json, strategy_json, paid, is_unlocked")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch medical bill appeals:", error);
    throw new Error(`Failed to fetch appeals: ${error.message}`);
  }

  return data || [];
}

/**
 * Get a specific document by ID
 * @param {string} documentId - The document ID
 * @returns {Promise<object>} - The document record
 */
export async function getDocument(documentId) {
  const { data, error } = await supabase
    .from('claim_letters')
    .select('*')
    .eq('id', documentId)
    .single();

  if (error) {
    console.error('Failed to fetch document:', error);
    throw new Error(`Failed to fetch document: ${error.message}`);
  }

  return data;
}

/**
 * Update document with extracted text
 * @param {string} documentId - The document ID
 * @param {string} extractedText - The extracted text
 * @returns {Promise<object>} - The updated record
 */
export async function updateDocumentText(documentId, extractedText) {
  const { data, error } = await supabase
    .from('claim_letters')
    .update({
      extracted_text: extractedText,
      letter_text: extractedText,
      status: 'extracted'
    })
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update document:', error);
    throw new Error(`Failed to update document: ${error.message}`);
  }

  return data;
}

/**
 * Update document with analysis results
 * @param {string} documentId - The document ID
 * @param {object} analysisData - The analysis results
 * @returns {Promise<object>} - The updated record
 */
export async function updateDocumentAnalysis(documentId, analysisData) {
  const { data, error } = await supabase
    .from('claim_letters')
    .update({
      analysis: analysisData,
      phase: analysisData.phase?.phase || null,
      risk_level: analysisData.riskAssessment?.riskLevel || null,
      summary: analysisData.summary || null,
      status: 'analyzed'
    })
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update analysis:', error);
    throw new Error(`Failed to update analysis: ${error.message}`);
  }

  return data;
}

/**
 * Update document with generated response
 * @param {string} documentId - The document ID
 * @param {string} generatedLetter - The generated response letter
 * @returns {Promise<object>} - The updated record
 */
export async function updateDocumentResponse(documentId, generatedLetter) {
  const { data, error } = await supabase
    .from('claim_letters')
    .update({
      ai_response: generatedLetter,
      generated_letter: generatedLetter,
      status: 'completed'
    })
    .eq('id', documentId)
    .select()
    .single();

  if (error) {
    console.error('Failed to update response:', error);
    throw new Error(`Failed to update response: ${error.message}`);
  }

  return data;
}

/**
 * Download file from Supabase Storage
 * @param {string} filePath - The file path in storage
 * @returns {Promise<Blob>} - The file blob
 */
export async function downloadFile(filePath) {
  const { data, error } = await supabase.storage
    .from('claim-letters')
    .download(filePath);

  if (error) {
    console.error('Download error:', error);
    throw new Error(`Failed to download file: ${error.message}`);
  }

  return data;
}
