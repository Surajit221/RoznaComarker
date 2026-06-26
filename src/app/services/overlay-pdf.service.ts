import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class OverlayPdfService {
  private http = inject(HttpClient);

  async downloadOverlayPdf(params: {
    worksheetId: string;
    submissionId?: string;
    assignmentId?: string;
    answers?: Record<string, string>;
    results?: Record<string, boolean | null>;
    score?: number;
    total?: number;
    studentName?: string;
    subject?: string;
    grade?: string;
    className?: string;
    assignmentTitle?: string;
    dueDate?: string;
  }): Promise<void> {
    
    let { answers, results, score, total } = params;
    
    console.log('[OVERLAY PDF SERVICE] === ANSWERS OBJECT INSPECTION ===');
    console.log('[OVERLAY PDF SERVICE] typeof answers:', typeof answers);
    console.log('[OVERLAY PDF SERVICE] answers instanceof Map:', answers instanceof Map);
    console.log('[OVERLAY PDF SERVICE] Object.keys(answers):', Object.keys(answers || {}));
    console.log('[OVERLAY PDF SERVICE] answers count:', Object.keys(answers || {}).length);
    console.log('[OVERLAY PDF SERVICE] full answers object:', JSON.stringify(answers, null, 2));
    console.log('[OVERLAY PDF SERVICE] Download requested:', {
      worksheetId: params.worksheetId,
      submissionId: params.submissionId,
      assignmentId: params.assignmentId,
      answersProvided: Object.keys(answers || {}).length
    });
    
    // If answers already provided and non-empty, use them
    if (answers && Object.keys(answers).length > 0) {
      console.log('[OVERLAY PDF] Using provided answers:', Object.keys(answers).length);
    } else if (params.submissionId || params.assignmentId) {
      // Fetch from API only if answers not provided
      console.log('[OVERLAY PDF] No answers provided, fetching data...');
      
      try {
        // First try submission by assignmentId (most common case)
        if (params.assignmentId) {
          const url = `${environment.apiUrl}/api/worksheets/${params.worksheetId}/my-submission-by-assignment?assignmentId=${params.assignmentId}`;
          console.log('[FETCH SUB] Trying:', url);
          
          const submission = await this.http.get<any>(url).toPromise();
          
          if (submission) {
            console.log('[FETCH SUB] Success from:', url);
            console.log('[FETCH SUB] Response:', JSON.stringify(submission).substring(0, 300));
            
            // Try all possible field names
            answers = submission?.activity9Answers
              || submission?.activity9Data?.answers
              || submission?.draftData?.activity9Data?.answers
              || {};
            results = submission?.activity9Results  
              || submission?.activity9Data?.results
              || submission?.draftData?.activity9Data?.results
              || {};
            score = submission?.totalPointsEarned
              || submission?.activity9Data?.score
              || submission?.score || 0;
            total = submission?.totalPointsPossible
              || submission?.activity9Data?.total
              || submission?.totalPoints || 0;
              
            console.log('[OVERLAY PDF] Fetched answers:', Object.keys(answers || {}).length);
            console.log('[OVERLAY PDF] Fetched score:', score, '/', total);
          }
        }
        
        // If still no answers and submissionId provided, try direct submission fetch
        if (Object.keys(answers || {}).length === 0 && params.submissionId) {
          const url = `${environment.apiUrl}/api/submissions/${params.submissionId}`;
          console.log('[FETCH SUB] Trying:', url);
          
          try {
            const submission = await this.http.get<any>(url).toPromise();
            
            if (submission) {
              console.log('[FETCH SUB] Success from:', url);
              console.log('[FETCH SUB] Response:', JSON.stringify(submission).substring(0, 300));
              
              // Try all possible field names
              answers = submission?.activity9Answers
                || submission?.activity9Data?.answers
                || submission?.draftData?.activity9Data?.answers
                || {};
              results = submission?.activity9Results  
                || submission?.activity9Data?.results
                || submission?.draftData?.activity9Data?.results
                || {};
              score = submission?.totalPointsEarned
                || submission?.activity9Data?.score
                || submission?.score || 0;
              total = submission?.totalPointsPossible
                || submission?.activity9Data?.total
                || submission?.totalPoints || 0;
                
              console.log('[OVERLAY PDF] Fetched answers:', Object.keys(answers || {}).length);
              console.log('[OVERLAY PDF] Fetched score:', score, '/', total);
            }
          } catch(e: any) {
            console.log('[FETCH SUB] Failed:', url, e.status);
          }
        }
        
        // If still no answers, try draft
        if (Object.keys(answers || {}).length === 0 && params.assignmentId) {
          const url = `${environment.apiUrl}/api/worksheets/${params.worksheetId}/draft?assignmentId=${params.assignmentId}`;
          console.log('[FETCH SUB] Trying:', url);
          
          const draft = await this.http.get<any>(url).toPromise();
          
          if (draft) {
            console.log('[FETCH SUB] Success from:', url);
            console.log('[FETCH SUB] Response:', JSON.stringify(draft).substring(0, 300));
            
            // Try all possible field names
            answers = draft?.activity9Answers
              || draft?.activity9Data?.answers
              || draft?.draftData?.activity9Data?.answers
              || {};
            results = draft?.activity9Results  
              || draft?.activity9Data?.results
              || draft?.draftData?.activity9Data?.results
              || {};
            score = draft?.activity9Score
              || draft?.activity9Data?.score
              || draft?.score || 0;
            total = draft?.activity9Total
              || draft?.activity9Data?.total
              || draft?.totalPoints || 0;
              
            console.log('[OVERLAY PDF] Fetched answers:', Object.keys(answers || {}).length);
            console.log('[OVERLAY PDF] Fetched score:', score, '/', total);
          }
        }
          
      } catch(e) {
        console.error('[OVERLAY PDF] Fetch failed:', e);
      }
    }
    
    console.log('[OVERLAY PDF] Final answers count:', Object.keys(answers || {}).length);
    console.log('[OVERLAY PDF] Final score:', score, '/', total);
    
    const payload = {
      answers: answers || {},
      results: results || {},
      studentName: params.studentName || 'Student',
      score: score || 0,
      total: total || 0,
      subject: params.subject || '',
      grade: params.grade || '',
      className: params.className || '',
      assignmentTitle: params.assignmentTitle || '',
      dueDate: params.dueDate || ''
    };
    
    const response = await this.http.post(
      `${environment.apiUrl}/api/worksheets/${params.worksheetId}/download-overlay`,
      payload,
      { responseType: 'blob' }
    ).toPromise();
    
    const blob = new Blob([response as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = (params.studentName || 'student').replace(/\s+/g, '-').toLowerCase();
    link.download = `${safeName}_worksheet_results.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('[OVERLAY PDF] Downloaded successfully');
  }
}
