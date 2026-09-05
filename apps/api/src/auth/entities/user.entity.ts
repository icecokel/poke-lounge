import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * 사용자 정보 엔티티
 */
@Entity()
export class User {
  /**
   * 기존 계정/개발 테스트 계정 식별자 (스키마 호환용)
   */
  @PrimaryColumn()
  id: string;

  /**
   * 사용자 이메일
   */
  @Column()
  email: string;

  /**
   * 이름 (First Name)
   */
  @Column()
  firstName: string;

  /**
   * 성 (Last Name)
   */
  @Column()
  lastName: string;

  /**
   * 기존 토큰 컬럼 (현재 미사용, 스키마 호환용으로 유지)
   */
  @Column({ nullable: true })
  accessToken: string;
}
