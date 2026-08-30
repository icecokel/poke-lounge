import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * 사용자 정보 엔티티
 */
@Entity()
export class User {
  /**
   * 고유 식별자 (구글 sub ID 사용)
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
   * 구글 액세스 토큰 (필요시 사용)
   */
  @Column({ nullable: true })
  accessToken: string;
}
