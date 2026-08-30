import type { CompetitiveAssignmentProjection } from '../competitive/competitive-match.types';
import { CompetitiveActionResponseDto } from './competitive-action-response.dto';

export class CompetitiveAssignmentResponseDto
  extends CompetitiveActionResponseDto
  implements CompetitiveAssignmentProjection {}
