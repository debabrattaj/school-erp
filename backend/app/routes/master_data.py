from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MasterData, User
from app.schemas import MasterDataCreate, MasterDataUpdate, MasterDataResponse
from app.security import require_roles

router = APIRouter(
    prefix="/master-data",
    tags=["Master Data"]
)


ALLOWED_CATEGORIES = [
    "Class",
    "Exam",
    "Department",
    "Subject",
    "House",
    "Section",
    "FeeType",
    "AttendanceStatus",
    "ExamType",
    "EmploymentType",
    "Gender",
    "BloodGroup",
    "Nationality",
    "TransportRoute",
    "LibraryCategory",
    "InventoryCategory",
    "InventoryUnit",
    "SalaryGrade",
    "StudentStatus",
    "AcademicYear"
]


def validate_category(category: str):
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Allowed: {', '.join(ALLOWED_CATEGORIES)}"
        )


@router.post("/", response_model=MasterDataResponse)
def create_master_data(
    data: MasterDataCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"]))
):
    validate_category(data.category)

    existing = db.query(MasterData).filter(
        MasterData.category == data.category,
        MasterData.value == data.value
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="This value already exists in this category"
        )

    new_item = MasterData(
        category=data.category,
        value=data.value,
        is_active=data.is_active,
        sort_order=data.sort_order or 0
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return new_item


@router.get("/", response_model=list[MasterDataResponse])
def get_all_master_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    )
):
    return db.query(MasterData).order_by(
        MasterData.category.asc(),
        MasterData.sort_order.asc(),
        MasterData.value.asc()
    ).all()


@router.get("/categories")
def get_master_data_categories(
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    )
):
    return {
        "categories": ALLOWED_CATEGORIES
    }


@router.get("/{category}")
def get_master_data_by_category(
    category: str,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    )
):
    validate_category(category)

    query = db.query(MasterData).filter(
        MasterData.category == category
    )

    if active_only:
        query = query.filter(MasterData.is_active == True)

    records = query.order_by(
        MasterData.sort_order.asc(),
        MasterData.value.asc()
    ).all()

    return {
        "category": category,
        "values": [
            {
                "id": item.id,
                "value": item.value,
                "is_active": item.is_active,
                "sort_order": item.sort_order
            }
            for item in records
        ]
    }


@router.put("/{item_id}", response_model=MasterDataResponse)
def update_master_data(
    item_id: int,
    data: MasterDataUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"]))
):
    item = db.query(MasterData).filter(
        MasterData.id == item_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Master data item not found"
        )

    update_data = data.model_dump(exclude_unset=True)

    if "category" in update_data and update_data["category"]:
        validate_category(update_data["category"])

    new_category = update_data.get("category", item.category)
    new_value = update_data.get("value", item.value)

    existing = db.query(MasterData).filter(
        MasterData.category == new_category,
        MasterData.value == new_value,
        MasterData.id != item_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Another value already exists in this category"
        )

    for key, value in update_data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)

    return item


@router.delete("/{item_id}")
def delete_master_data(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"]))
):
    item = db.query(MasterData).filter(
        MasterData.id == item_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Master data item not found"
        )

    db.delete(item)
    db.commit()

    return {
        "message": "Master data item deleted successfully"
    }
