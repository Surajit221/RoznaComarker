import { Component, Input, type OnChanges, type OnInit, inject } from '@angular/core';
import { TokenizedTranscript } from '../../submission-details/tokenized-transcript/tokenized-transcript';
import { WritingCorrectionsLegendComponent } from '../../writing-corrections-legend/writing-corrections-legend';
import { WritingCorrectionsApiService } from '../../../api/writing-corrections-api.service';
import type { CorrectionLegend } from '../../../models/correction-legend.model';
import type { SpeakingResult } from '../../../api/speaking-api.service';
import { type SpeakingTranscriptModel, buildSpeakingTranscript, speakingCategoryLabel } from '../../../utils/speaking-transcript';
import { type SpeakingCorrectionGroup, type SpeakingStatisticRow, groupSpeakingCorrections, speakingCorrectionStatistics } from '../../../utils/speaking-corrections';

/** The categories marked for speech (stage 6): the legend shows only these. */
const SPEECH_GROUPS = ['GRAMMAR', 'VOCABULARY'];

/**
 * What was said (stage 7e): the assessed text in the existing transcript component with the corrections highlighted, the same corrections as a
 * plain list (so colour is never the only signal), a labelled checkbox that puts the removed filler words back in brackets, and the correction
 * legend for the speech categories.
 */
@Component({
  selector: 'app-speaking-transcript',
  imports: [TokenizedTranscript, WritingCorrectionsLegendComponent],
  templateUrl: './speaking-transcript.html',
  styleUrl: './speaking-transcript.css'
})
export class SpeakingTranscript implements OnInit, OnChanges {
  private readonly correctionsApi = inject(WritingCorrectionsApiService);
  @Input({ required: true }) result!: SpeakingResult;

  showFillers = false;
  model: SpeakingTranscriptModel = { words: [], annotations: [] };
  legend: CorrectionLegend | null = null;
  /** The plain list: identical corrections once, with a count (the transcript keeps every highlight). */
  groups: SpeakingCorrectionGroup[] = [];
  /** Issue counts per category, every occurrence counted (as the essay Correction Statistics). */
  statistics: SpeakingStatisticRow[] = [];
  readonly label = speakingCategoryLabel;

  get hasFillers(): boolean { return (this.result?.fillers?.length ?? 0) > 0; }

  ngOnInit(): void {
    this.correctionsApi.getLegend()
      .then(legend => { this.legend = { ...legend, groups: (legend?.groups ?? []).filter(group => SPEECH_GROUPS.includes(String(group.key).toUpperCase())) }; })
      .catch(() => { this.legend = null; });
  }

  ngOnChanges(): void {
    if (!this.hasFillers) this.showFillers = false;
    const corrections = this.result?.corrections ?? [];
    this.groups = groupSpeakingCorrections(corrections);
    this.statistics = speakingCorrectionStatistics(corrections);
    this.rebuild();
  }

  toggleFillers(event: Event): void {
    this.showFillers = (event.target as HTMLInputElement).checked;
    this.rebuild();
  }

  private rebuild(): void {
    this.model = buildSpeakingTranscript(this.result?.assessedText, this.result?.corrections ?? [], this.result?.fillers ?? [],
      { showFillers: this.showFillers, submissionId: this.result?.submissionId });
  }
}
