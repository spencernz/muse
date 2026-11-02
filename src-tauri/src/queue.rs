use rand::seq::SliceRandom;

pub fn configure_play_mode(playback: &mut crate::models::Playback, mode: Option<&str>) {
    if mode == Some("ordered") {
        playback.shuffle = false;
        playback.repeat = "off".into();
    }
    if mode == Some("shuffle") {
        playback.shuffle = true;
    }
}
#[derive(Default)]
pub struct QueueOrder {
    pub history: Vec<usize>,
    bag: Vec<usize>,
}
impl QueueOrder {
    pub fn reset(&mut self) {
        self.history.clear();
        self.bag.clear();
    }
    pub fn next(
        &mut self,
        len: usize,
        index: usize,
        shuffle: bool,
        repeat: &str,
        natural: bool,
    ) -> Option<usize> {
        if len == 0 {
            return None;
        }
        if natural && repeat == "one" {
            return Some(index);
        }
        if shuffle {
            if self.bag.is_empty() {
                if self.history.len() >= len.saturating_sub(1) && repeat != "all" {
                    return None;
                }
                self.bag = (0..len).filter(|i| *i != index).collect();
                self.bag.shuffle(&mut rand::rng());
            }
            let next = self
                .bag
                .pop()
                .or_else(|| if repeat == "all" { Some(index) } else { None })?;
            self.history.push(index);
            Some(next)
        } else if index + 1 < len {
            self.history.push(index);
            Some(index + 1)
        } else if repeat == "all" {
            self.history.push(index);
            Some(0)
        } else {
            None
        }
    }
    pub fn previous(&mut self, index: usize) -> usize {
        self.history
            .pop()
            .unwrap_or_else(|| index.saturating_sub(1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeat_one_applies_only_to_automatic_end() {
        let mut q = QueueOrder::default();
        assert_eq!(q.next(3, 1, false, "one", true), Some(1));
        assert_eq!(q.next(3, 1, false, "one", false), Some(2));
        assert_eq!(q.next(3, 2, false, "off", true), None);
        assert_eq!(q.next(3, 2, false, "all", true), Some(0));
    }
    #[test]
    fn shuffle_visits_every_track_before_stopping() {
        let mut q = QueueOrder::default();
        let mut visited = vec![0];
        let mut i = 0;
        while let Some(next) = q.next(20, i, true, "off", true) {
            assert!(!visited.contains(&next));
            visited.push(next);
            i = next;
        }
        assert_eq!(visited.len(), 20);
    }
}

#[cfg(test)]
mod mode_tests {
    #[test]
    fn dj_order_disables_repeating_without_changing_other_play_requests() {
        let mut playback = crate::models::Playback {
            shuffle: true,
            repeat: "all".into(),
            ..Default::default()
        };
        super::configure_play_mode(&mut playback, None);
        assert!(playback.shuffle);
        assert_eq!(playback.repeat, "all");
        super::configure_play_mode(&mut playback, Some("ordered"));
        assert!(!playback.shuffle);
        assert_eq!(playback.repeat, "off");
    }
}
