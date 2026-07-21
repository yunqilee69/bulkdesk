from collections.abc import Iterable

from app.models.employee import Employee, EmployeeRole


def employee_roles(employee: Employee) -> set[EmployeeRole]:
    return {assignment.role for assignment in employee.role_assignments}


def role_values(employee: Employee) -> set[str]:
    return {role.value for role in employee_roles(employee)}


def has_any_role(employee: Employee, *required: EmployeeRole) -> bool:
    roles = employee_roles(employee)
    return EmployeeRole.admin in roles or bool(roles.intersection(required))


def normalize_roles(values: Iterable[EmployeeRole]) -> list[EmployeeRole]:
    return sorted(set(values), key=lambda role: role.value)
