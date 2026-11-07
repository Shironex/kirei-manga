use std::cmp::Ordering;
use std::iter::Peekable;
use std::str::Chars;

/// Natural ("human") order for page names: digit runs compare by value, so
/// `page2` sorts before `page10`, and letters compare case-insensitively.
///
/// Ties (`01` and `1`, `A` and `a`) fall back to a plain comparison so the
/// order is total and stable across platforms.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut left = a.chars().peekable();
    let mut right = b.chars().peekable();
    loop {
        match (left.peek().copied(), right.peek().copied()) {
            (None, None) => return a.cmp(b),
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(l), Some(r)) if l.is_ascii_digit() && r.is_ascii_digit() => {
                let ordering = compare_numbers(&mut left, &mut right);
                if ordering != Ordering::Equal {
                    return ordering;
                }
            }
            (Some(l), Some(r)) => {
                let ordering = fold(l).cmp(&fold(r));
                if ordering != Ordering::Equal {
                    return ordering;
                }
                left.next();
                right.next();
            }
        }
    }
}

/// Case-folds one character for comparison. Multi-char lowercase forms (rare,
/// none in Latin or Polish letters) keep their first char.
fn fold(c: char) -> char {
    c.to_lowercase().next().unwrap_or(c)
}

/// Compares two digit runs by value without parsing, so runs longer than any
/// integer type still order correctly.
fn compare_numbers(left: &mut Peekable<Chars<'_>>, right: &mut Peekable<Chars<'_>>) -> Ordering {
    let l = take_digits(left);
    let r = take_digits(right);
    let l_trimmed = l.trim_start_matches('0');
    let r_trimmed = r.trim_start_matches('0');
    l_trimmed
        .len()
        .cmp(&r_trimmed.len())
        .then_with(|| l_trimmed.cmp(r_trimmed))
}

fn take_digits(chars: &mut Peekable<Chars<'_>>) -> String {
    let mut digits = String::new();
    while let Some(c) = chars.next_if(char::is_ascii_digit) {
        digits.push(c);
    }
    digits
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sorted(names: &[&str]) -> Vec<String> {
        let mut v: Vec<String> = names.iter().map(|s| (*s).to_owned()).collect();
        v.sort_by(|a, b| natural_cmp(a, b));
        v
    }

    #[test]
    fn numbers_compare_by_value() {
        assert_eq!(
            sorted(&["page10.jpg", "page2.jpg", "page1.jpg"]),
            ["page1.jpg", "page2.jpg", "page10.jpg"]
        );
    }

    #[test]
    fn zero_padding_does_not_change_order() {
        assert_eq!(
            sorted(&["010.png", "9.png", "0011.png"]),
            ["9.png", "010.png", "0011.png"]
        );
    }

    #[test]
    fn letters_ignore_case() {
        assert_eq!(
            sorted(&["b.png", "A.png", "c.png"]),
            ["A.png", "b.png", "c.png"]
        );
    }

    #[test]
    fn folders_sort_before_their_contents_naturally() {
        assert_eq!(
            sorted(&["ch10/01.jpg", "ch2/01.jpg", "ch2/10.jpg", "ch2/2.jpg"]),
            ["ch2/01.jpg", "ch2/2.jpg", "ch2/10.jpg", "ch10/01.jpg"]
        );
    }

    #[test]
    fn polish_letters_fold_case() {
        assert_eq!(natural_cmp("Żółw 2.png", "żółw 10.png"), Ordering::Less);
        assert_eq!(natural_cmp("ŁÓDŹ", "łódź"), "ŁÓDŹ".cmp("łódź"));
    }

    #[test]
    fn huge_digit_runs_do_not_overflow() {
        let a = format!("{}1", "9".repeat(40));
        let b = format!("{}2", "9".repeat(40));
        assert_eq!(natural_cmp(&a, &b), Ordering::Less);
    }

    #[test]
    fn order_is_total() {
        assert_ne!(natural_cmp("01.png", "1.png"), Ordering::Equal);
        assert_ne!(natural_cmp("A.png", "a.png"), Ordering::Equal);
    }
}
