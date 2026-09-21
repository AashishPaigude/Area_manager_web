from typing import Optional, Union
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.enums.role_type import RoleType
from app.schemas.report_email_access import (
    ReportEmailAccessResponse,
    ReportEmailAccessSummary,
    BranchEmailAccessItem,
    UpdateEmailAccessResponse
)

class ReportEmailAccessService:
    
    @staticmethod
    def _validate_admin_role(user_role: Optional[Union[RoleType, str]] = None) -> None:
        if user_role is not None:
            role_str = user_role.value if hasattr(user_role, "value") else str(user_role)
            if role_str.lower() != RoleType.ADMIN.value.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Report Email Access is restricted to administrators."
                )

    @staticmethod
    def get_branches(
        db: Session,
        user_role: Optional[Union[RoleType, str]] = None
    ) -> ReportEmailAccessResponse:
        """
        Fetch all branches with Field Officer count (DESIGNATION = 19, active = 1)
        and branch level email_access status. Admin-only.
        """
        ReportEmailAccessService._validate_admin_role(user_role)

        sql = text("""
            SELECT
                b.oid,
                b.name,
                b.short_name,
                b.address,
                b.email_access,
                COUNT(e.oid) AS field_officer_count
            FROM BRANCH b
            LEFT JOIN EMPLOYEE e
                ON e.BRANCH = b.oid
                AND e.active = 1
                AND e.DESIGNATION = 19
            GROUP BY
                b.oid,
                b.name,
                b.short_name,
                b.address,
                b.email_access
            ORDER BY b.name ASC;
        """)

        results = db.execute(sql).fetchall()

        branch_items = []
        enabled_count = 0
        disabled_count = 0

        for row in results:
            # row: oid, name, short_name, address, email_access, field_officer_count
            b_oid = row[0]
            b_name = row[1]
            b_short_name = row[2]
            b_address = row[3]
            b_email_access = bool(row[4])
            fo_count = int(row[5])

            if b_email_access:
                enabled_count += 1
            else:
                disabled_count += 1

            branch_items.append(
                BranchEmailAccessItem(
                    oid=b_oid,
                    name=b_name,
                    short_name=b_short_name,
                    address=b_address,
                    email_access=b_email_access,
                    field_officer_count=fo_count
                )
            )

        summary = ReportEmailAccessSummary(
            enabled_count=enabled_count,
            disabled_count=disabled_count,
            total_count=len(branch_items)
        )

        return ReportEmailAccessResponse(
            summary=summary,
            branches=branch_items
        )

    @staticmethod
    def update_branch_email_access(
        db: Session,
        branch_oid: int,
        email_access: bool,
        user_role: Optional[Union[RoleType, str]] = None
    ) -> UpdateEmailAccessResponse:
        """
        Toggle email_access for a specific branch. Only updates BRANCH.email_access column. Admin-only.
        """
        ReportEmailAccessService._validate_admin_role(user_role)

        check_sql = text("SELECT oid, name FROM BRANCH WHERE oid = :oid")
        branch = db.execute(check_sql, {"oid": branch_oid}).fetchone()

        if not branch:
            raise HTTPException(status_code=404, detail=f"Branch with OID {branch_oid} not found")

        update_val = 1 if email_access else 0
        update_sql = text("UPDATE BRANCH SET email_access = :email_access WHERE oid = :oid")
        db.execute(update_sql, {"email_access": update_val, "oid": branch_oid})
        db.commit()

        status_str = "enabled" if email_access else "disabled"
        return UpdateEmailAccessResponse(
            success=True,
            message=f"Email access successfully {status_str} for branch '{branch[1]}'.",
            branch_oid=branch_oid,
            email_access=email_access
        )
