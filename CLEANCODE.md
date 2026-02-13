---
description: Clean Code, SOLID and Scalable Rules for Python
globs:
alwaysApply: true
---

# Clean Code, SOLID and Scalable Rules for Python

## 1. Code Quality Fundamentals

Always write Python code that is clean, modular, and scalable.

- Follow the **Single Responsibility Principle** for every function, class, and module
- Split code into small, reusable parts and avoid monolithic files
- Apply the **DRY rule** (Don't Repeat Yourself)
- Follow **PEP 8** style guide for Python code

**Example - Single Responsibility:**
```python
# ❌ BAD: Function does too much
def process_user(data):
    user = validate_data(data)
    save_to_db(user)
    send_email(user)
    log_activity(user)
    return user

# ✅ GOOD: Each function has one responsibility
def validate_user_data(data: dict) -> User:
    """Validate and create User object from raw data."""
    return User(**data)

def save_user(user: User) -> None:
    """Persist user to database."""
    db.save(user)

def notify_user(user: User) -> None:
    """Send welcome email to user."""
    send_email(user.email, "Welcome!")
```

## 2. Type Hints & Validation

Use type hints everywhere and Pydantic for data validation.

- Add type hints to **all** function signatures
- Use `Optional`, `Union`, `List`, `Dict` from `typing` module
- Use Pydantic models for complex data structures
- Enable mypy for static type checking

**Example:**
```python
from typing import List, Optional, Dict
from pydantic import BaseModel, Field

class UserProfile(BaseModel):
    """User profile data model."""
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., regex=r'^[\w\.-]+@[\w\.-]+\.\w+$')
    age: Optional[int] = Field(None, ge=0, le=150)
    tags: List[str] = Field(default_factory=list)

def get_user_by_id(user_id: int) -> Optional[UserProfile]:
    """
    Retrieve user profile by ID.
    
    Args:
        user_id: Unique identifier for the user
        
    Returns:
        User profile if found, None otherwise
    """
    return db.query(UserProfile).filter_by(id=user_id).first()
```

## 3. Documentation Standards

Every function, method, and class must have proper docstrings in **Google style**.

**Function Docstring Template:**
```python
def function_name(param1: Type1, param2: Type2) -> ReturnType:
    """
    Brief one-line description.
    
    Longer description explaining what the function does,
    when to use it, and any important details.
    
    Args:
        param1: Description of first parameter
        param2: Description of second parameter
        
    Returns:
        Description of return value
        
    Raises:
        ExceptionType: When this exception is raised
        
    Example:
        >>> function_name("value1", 42)
        Expected output
    """
    pass
```

**Class Docstring Template:**
```python
class ClassName:
    """
    Brief one-line description of the class.
    
    Longer description of the class purpose, its responsibilities,
    and how it fits into the larger system.
    
    Attributes:
        attribute1: Description of attribute1
        attribute2: Description of attribute2
        
    Example:
        >>> obj = ClassName(param1, param2)
        >>> obj.method()
        Expected output
    """
    
    def __init__(self, param1: str, param2: int):
        """
        Initialize ClassName instance.
        
        Args:
            param1: Description
            param2: Description
        """
        self.attribute1 = param1
        self.attribute2 = param2
```

## 4. SOLID Principles in Python

### Single Responsibility Principle (SRP)
```python
# ❌ BAD: Class has multiple responsibilities
class User:
    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email
    
    def save_to_database(self):
        # Database logic
        pass
    
    def send_email(self):
        # Email logic
        pass

# ✅ GOOD: Separated responsibilities
class User:
    """User data model."""
    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email

class UserRepository:
    """Handles user persistence."""
    def save(self, user: User) -> None:
        db.save(user)

class EmailService:
    """Handles email notifications."""
    def send_welcome_email(self, user: User) -> None:
        send_email(user.email, "Welcome!")
```

### Open/Closed Principle (OCP)
```python
from abc import ABC, abstractmethod

# ✅ GOOD: Open for extension, closed for modification
class PaymentProcessor(ABC):
    """Abstract base class for payment processing."""
    
    @abstractmethod
    def process_payment(self, amount: float) -> bool:
        """Process payment and return success status."""
        pass

class CreditCardProcessor(PaymentProcessor):
    """Process credit card payments."""
    def process_payment(self, amount: float) -> bool:
        # Credit card logic
        return True

class PayPalProcessor(PaymentProcessor):
    """Process PayPal payments."""
    def process_payment(self, amount: float) -> bool:
        # PayPal logic
        return True
```

### Dependency Inversion Principle (DIP)
```python
# ✅ GOOD: Depend on abstractions, not concretions
class EmailSender(ABC):
    """Abstract email sender interface."""
    @abstractmethod
    def send(self, to: str, subject: str, body: str) -> None:
        pass

class SMTPEmailSender(EmailSender):
    """SMTP implementation of email sender."""
    def send(self, to: str, subject: str, body: str) -> None:
        # SMTP logic
        pass

class NotificationService:
    """Service that depends on abstraction, not concrete implementation."""
    def __init__(self, email_sender: EmailSender):
        self.email_sender = email_sender
    
    def notify_user(self, user_email: str, message: str) -> None:
        """Send notification using injected email sender."""
        self.email_sender.send(user_email, "Notification", message)
```

## 5. Pythonic Code Practices

Write idiomatic Python code:

**Use List Comprehensions:**
```python
# ✅ GOOD: Pythonic
active_users = [user for user in users if user.is_active]

# ❌ BAD: Not pythonic
active_users = []
for user in users:
    if user.is_active:
        active_users.append(user)
```

**Use Context Managers:**
```python
# ✅ GOOD: Automatic resource cleanup
with open('file.txt', 'r') as f:
    content = f.read()

# ✅ GOOD: Custom context manager
from contextlib import contextmanager

@contextmanager
def database_connection(db_url: str):
    """Context manager for database connections."""
    conn = connect(db_url)
    try:
        yield conn
    finally:
        conn.close()
```

**Use Generators for Large Data:**
```python
def read_large_file(file_path: str):
    """
    Read large file line by line using generator.
    
    Args:
        file_path: Path to the file
        
    Yields:
        One line at a time
    """
    with open(file_path, 'r') as f:
        for line in f:
            yield line.strip()
```

**Use Dataclasses:**
```python
from dataclasses import dataclass, field
from typing import List

@dataclass
class Product:
    """Product data model using dataclass."""
    name: str
    price: float
    tags: List[str] = field(default_factory=list)
    in_stock: bool = True
```

## 6. Error Handling

Proper exception handling is crucial:

```python
# ✅ GOOD: Specific exceptions with proper handling
def divide_numbers(a: float, b: float) -> float:
    """
    Divide two numbers with proper error handling.
    
    Args:
        a: Numerator
        b: Denominator
        
    Returns:
        Result of division
        
    Raises:
        ValueError: If denominator is zero
        TypeError: If inputs are not numeric
    """
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        raise TypeError("Both arguments must be numeric")
    
    if b == 0:
        raise ValueError("Cannot divide by zero")
    
    return a / b

# ✅ GOOD: Custom exceptions
class ValidationError(Exception):
    """Raised when data validation fails."""
    pass

class UserNotFoundError(Exception):
    """Raised when user lookup fails."""
    pass
```

## 7. Testing & Code Quality

Write testable code and maintain high test coverage:

```python
# ✅ GOOD: Testable function with dependency injection
def process_order(order: Order, payment_processor: PaymentProcessor, 
                  email_service: EmailService) -> bool:
    """
    Process order with injected dependencies for easy testing.
    
    Args:
        order: Order to process
        payment_processor: Payment processor implementation
        email_service: Email service implementation
        
    Returns:
        True if order processed successfully
    """
    if payment_processor.process_payment(order.total):
        email_service.send_confirmation(order.user_email)
        return True
    return False

# Unit test example
def test_process_order():
    """Test order processing with mocked dependencies."""
    mock_payment = Mock(spec=PaymentProcessor)
    mock_payment.process_payment.return_value = True
    
    mock_email = Mock(spec=EmailService)
    
    order = Order(total=100.0, user_email="test@example.com")
    
    result = process_order(order, mock_payment, mock_email)
    
    assert result is True
    mock_payment.process_payment.assert_called_once_with(100.0)
    mock_email.send_confirmation.assert_called_once()
```

## 8. Configuration & Environment

Never hardcode - use configuration:

```python
# ✅ GOOD: Configuration management
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    app_name: str = "MyApp"
    debug: bool = False
    database_url: str
    api_key: str
    max_connections: int = 10
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

# Usage
settings = get_settings()
db_connection = connect(settings.database_url)
```

## 9. Code Formatting Tools

Use these tools to maintain code quality:

**Required Tools:**
- **Black**: Code formatter (automatic formatting)
- **isort**: Import sorting
- **pylint**: Linting and code analysis
- **mypy**: Static type checking
- **pytest**: Testing framework

**Configuration Example (`pyproject.toml`):**
```toml
[tool.black]
line-length = 100
target-version = ['py312']

[tool.isort]
profile = "black"
line_length = 100

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_configs = true

[tool.pylint]
max-line-length = 100
disable = ["C0111"]
```

**Run Before Commit:**
```bash
# Format code
black .
isort .

# Check types
mypy .

# Lint
pylint **/*.py

# Test
pytest --cov=. --cov-report=html
```

## 10. Summary Checklist

Before committing Python code, verify:

- ✅ Each function/class has a single, clear responsibility
- ✅ All functions have type hints (args and return)
- ✅ All functions/classes have Google-style docstrings
- ✅ No code duplication (DRY)
- ✅ Pydantic models for data validation
- ✅ No hardcoded values; use Settings/config
- ✅ Proper exception handling with specific exceptions
- ✅ Code formatted with Black
- ✅ Imports sorted with isort
- ✅ No mypy errors
- ✅ No pylint errors (or properly suppressed)
- ✅ Unit tests written and passing
- ✅ SOLID principles followed
- ✅ Pythonic idioms used (comprehensions, context managers, etc.)
- ✅ Functions are small and focused (< 20 lines ideally)